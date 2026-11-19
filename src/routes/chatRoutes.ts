
import { Router, Request, Response } from "express";
import pool from "../config/database";
import firestore from "../config/firebase";
import admin from "firebase-admin";

// I created the doc on readme.md please visit to read what i have done!

const router = Router();

router.post("/create", async (req: Request, res: Response) => {
    const { userAId, userBId } = req.body;

    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (
        !userAId ||
        !userBId ||
        !uuidRegex.test(userAId) ||
        !uuidRegex.test(userBId) ||
        userAId === userBId
    ) {
        return res.status(400).json({
            success: false,
            message: "Please provide two different valid user IDs."
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Check whether both users exist
        const users = await client.query(
            `SELECT id FROM users WHERE id = ANY($1::uuid[])`,
            [[userAId, userBId]]
        );

        if (users.rows.length !== 2) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                success: false,
                message: "One or both users not found."
            });
        }

        // Check whether this one-to-one chat already exists
        const existingChat = await client.query(
            `SELECT c.id
             FROM chats c
             JOIN chat_members cm ON cm.chat_id = c.id
             GROUP BY c.id
             HAVING COUNT(*) = 2
                AND COUNT(*) FILTER (
                    WHERE cm.user_id IN ($1::uuid, $2::uuid)
                ) = 2
             LIMIT 1`,
            [userAId, userBId]
        );

        if (existingChat.rows.length > 0) {
            await client.query("COMMIT");

            return res.status(200).json({
                success: true,
                message: "Chat already exists.",
                chatId: existingChat.rows[0].id
            });
        }

        // Create new chat
        const newChat = await client.query(
            `INSERT INTO chats DEFAULT VALUES RETURNING id`
        );

        const chatId = newChat.rows[0].id;

        // Add both users to the chat
        await client.query(
            `INSERT INTO chat_members (chat_id, user_id)
             VALUES ($1, $2), ($1, $3)`,
            [chatId, userAId, userBId]
        );

        await client.query("COMMIT");

        return res.status(201).json({
            success: true,
            message: "Chat created successfully.",
            chatId
        });

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Create chat error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create chat."
        });
    } finally {
        client.release();
    }
});



router.post("/:chatId/message/send", async (req: Request, res: Response) => {
    const chatId = req.params.chatId as string;
    const { senderId, text } = req.body || {};

    if (!senderId || typeof text !== "string" || !text.trim()) {
        return res.status(400).json({
            success: false,
            message: "senderId and message text are required."
        });
    }

    try {
        // Check whether sender belongs to this chat
        const membership = await pool.query(
            `SELECT 1 FROM chat_members
             WHERE chat_id = $1 AND user_id = $2`,
            [chatId, senderId]
        );

        if (membership.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "Sender is not a member of this chat."
            });
        }

        // Save message in Firestore
        const messageRef = await firestore
            .collection("chats")
            .doc(chatId)
            .collection("messages")
            .add({
                senderId,
                text: text.trim(),
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                readBy: [
                    {
                        userId: senderId,
                        readAt: new Date()
                    }
                ]
            });

        // Get saved message
        const messageDoc = await messageRef.get();
        const message = messageDoc.data();

        return res.status(201).json({
            success: true,
            message: "Message sent successfully.",
            messageId: messageRef.id,
            data: {
                senderId: message?.senderId,
                text: message?.text,
                timestamp: message?.timestamp?.toDate(),
                readBy: message?.readBy
            }
        });

    } catch (error) {
        console.error("Send message error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to send message."
        });
    }
});



router.get("/:chatId/messages", async (req: Request, res: Response) => {
    const chatId = req.params.chatId as string;

    const requestedLimit = Number(req.query.limit ?? 50);

    if (
        !Number.isInteger(requestedLimit) ||
        requestedLimit < 1 ||
        requestedLimit > 100
    ) {
        return res.status(400).json({
            success: false,
            message: "Limit must be between 1 and 100."
        });
    }

    try {
        // Check whether chat exists
        const chat = await pool.query(
            "SELECT id FROM chats WHERE id = $1",
            [chatId]
        );

        if (chat.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Chat not found."
            });
        }

        // Fetch messages from Firestore
        const snapshot = await firestore
            .collection("chats")
            .doc(chatId)
            .collection("messages")
            .orderBy("timestamp", "asc")
            .limit(requestedLimit)
            .get();

        const messages = snapshot.docs.map((doc) => {
            const data = doc.data();

            return {
                messageId: doc.id,
                senderId: data.senderId,
                text: data.text,
                timestamp: data.timestamp?.toDate() ?? null,
                readBy: data.readBy ?? []
            };
        });

        return res.status(200).json({
            success: true,
            count: messages.length,
            messages
        });

    } catch (error) {
        console.error("Get messages error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch messages."
        });
    }
});

//mark as read

router.post(
    "/:chatId/message/:messageId/read",
    async (req: Request, res: Response) => {
        const chatId = req.params.chatId as string;
        const messageId = req.params.messageId as string;
        const { userId } = req.body || {};

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "userId is required."
            });
        }

        try {
            // Verify user belongs to chat
            const membership = await pool.query(
                `SELECT 1 FROM chat_members
                 WHERE chat_id = $1 AND user_id = $2`,
                [chatId, userId]
            );

            if (membership.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: "User is not a member of this chat."
                });
            }

            const messageRef = firestore
                .collection("chats")
                .doc(chatId)
                .collection("messages")
                .doc(messageId);

            const result = await firestore.runTransaction(async (transaction) => {
                const messageDoc = await transaction.get(messageRef);

                if (!messageDoc.exists) {
                    return false;
                }

                const readBy = messageDoc.data()?.readBy ?? [];

                const alreadyRead = readBy.some(
                    (receipt: { userId: string }) =>
                        receipt.userId === userId
                );

                if (!alreadyRead) {
                    transaction.update(messageRef, {
                        readBy: admin.firestore.FieldValue.arrayUnion({
                            userId,
                            readAt: new Date()
                        })
                    });
                }

                return true;
            });

            if (!result) {
                return res.status(404).json({
                    success: false,
                    message: "Message not found."
                });
            }

            return res.status(200).json({
                success: true,
                message: "Message marked as read."
            });

        } catch (error) {
            console.error("Mark read error:", error);

            return res.status(500).json({
                success: false,
                message: "Failed to update read receipt."
            });
        }
    }
);


//last seen

router.post("/:chatId/lastseen", async (req: Request, res: Response) => {
    const chatId = req.params.chatId as string;
    const { userId, messageId } = req.body || {};

    if (!userId || !messageId) {
        return res.status(400).json({
            success: false,
            message: "userId and messageId are required."
        });
    }

    try {
        // Verify user belongs to chat
        const membership = await pool.query(
            `SELECT 1 FROM chat_members
             WHERE chat_id = $1 AND user_id = $2`,
            [chatId, userId]
        );

        if (membership.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: "User is not a member of this chat."
            });
        }

        // Verify message exists
        const messageRef = firestore
            .collection("chats")
            .doc(chatId)
            .collection("messages")
            .doc(messageId);

        const messageDoc = await messageRef.get();

        if (!messageDoc.exists) {
            return res.status(404).json({
                success: false,
                message: "Message not found."
            });
        }

        // Store last seen separately for each user
        await firestore
            .collection("chats")
            .doc(chatId)
            .collection("lastSeen")
            .doc(userId)
            .set({
                userId,
                lastSeenMessageId: messageId,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

        return res.status(200).json({
            success: true,
            message: "Last seen updated successfully."
        });

    } catch (error) {
        console.error("Last seen error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to update last seen."
        });
    }
});


// get chats

router.get("/user/:userId/chats", async (req: Request, res: Response) => {
    const { userId } = req.params;

    try {
        // Get all chats belonging to this user
        const result = await pool.query(
            `SELECT
                c.id AS "chatId",
                c.created_at AS "createdAt",
                ARRAY_AGG(cm.user_id) AS "memberIds"
             FROM chats c
             JOIN chat_members cm ON cm.chat_id = c.id
             WHERE EXISTS (
                 SELECT 1
                 FROM chat_members my_chat
                 WHERE my_chat.chat_id = c.id
                 AND my_chat.user_id = $1
             )
             GROUP BY c.id
             ORDER BY c.created_at DESC`,
            [userId]
        );

        return res.status(200).json({
            success: true,
            count: result.rows.length,
            chats: result.rows
        });

    } catch (error) {
        console.error("Get user chats error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch user chats."
        });
    }
});


// delete message (soft delete)

router.delete(
    "/:chatId/message/:messageId",
    async (req: Request, res: Response) => {
        const chatId = req.params.chatId as string;
        const  messageId  = req.params.messageId as string;

        const { userId } = req.body || {};

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: "userId is required."
            });
        }

        try {
            const membership = await pool.query(
                `SELECT 1 FROM chat_members
                 WHERE chat_id = $1 AND user_id = $2`,
                [chatId, userId]
            );

            if (membership.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: "User is not a member of this chat."
                });
            }

            const messageRef = firestore
                .collection("chats")
                .doc(chatId)
                .collection("messages")
                .doc(messageId);

            const deleted = await firestore.runTransaction(async (transaction) => {
                const messageDoc = await transaction.get(messageRef);

                if (!messageDoc.exists) {
                    return "NOT_FOUND";
                }

                const message = messageDoc.data();

                if (message?.senderId !== userId) {
                    return "FORBIDDEN";
                }

                if (message?.deleted) {
                    return "ALREADY_DELETED";
                }

                transaction.update(messageRef, {
                    text: null,
                    deleted: true,
                    deletedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                return "SUCCESS";
            });

            if (deleted === "NOT_FOUND") {
                return res.status(404).json({
                    success: false,
                    message: "Message not found."
                });
            }

            if (deleted === "FORBIDDEN") {
                return res.status(403).json({
                    success: false,
                    message: "You can only delete your own messages."
                });
            }

            if (deleted === "ALREADY_DELETED") {
                return res.status(400).json({
                    success: false,
                    message: "Message already deleted."
                });
            }

            return res.status(200).json({
                success: true,
                message: "Message deleted successfully."
            });

        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to delete message."
            });
        }
    }
);

// edit message
router.patch(
    "/:chatId/message/:messageId",
    async (req: Request, res: Response) => {
        const chatId = req.params.chatId as string;
        const  messageId  = req.params.messageId as string;
        const { userId, text } = req.body || {};

        if (!userId || typeof text !== "string" || !text.trim()) {
            return res.status(400).json({
                success: false,
                message: "userId and message text are required."
            });
        }

        try {
            const membership = await pool.query(
                `SELECT 1 FROM chat_members
                 WHERE chat_id = $1 AND user_id = $2`,
                [chatId, userId]
            );

            if (membership.rows.length === 0) {
                return res.status(403).json({
                    success: false,
                    message: "User is not a member of this chat."
                });
            }

            const messageRef = firestore
                .collection("chats")
                .doc(chatId)
                .collection("messages")
                .doc(messageId);

            const updated = await firestore.runTransaction(async (transaction) => {
                const messageDoc = await transaction.get(messageRef);

                if (!messageDoc.exists) {
                    return "NOT_FOUND";
                }

                const message = messageDoc.data();

                if (message?.senderId !== userId) {
                    return "FORBIDDEN";
                }

                if (message?.deleted) {
                    return "DELETED";
                }

                transaction.update(messageRef, {
                    text: text.trim(),
                    edited: true,
                    editedAt: admin.firestore.FieldValue.serverTimestamp()
                });

                return "SUCCESS";
            });

            if (updated === "NOT_FOUND") {
                return res.status(404).json({
                    success: false,
                    message: "Message not found."
                });
            }

            if (updated === "FORBIDDEN") {
                return res.status(403).json({
                    success: false,
                    message: "You can only edit your own messages."
                });
            }

            if (updated === "DELETED") {
                return res.status(400).json({
                    success: false,
                    message: "Deleted messages cannot be edited."
                });
            }

            return res.status(200).json({
                success: true,
                message: "Message updated successfully."
            });

        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to update message."
            });
        }
    }
);


export default router;