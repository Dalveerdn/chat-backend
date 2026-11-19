# Real-Time Chat Backend

A RESTful chat backend built using Node.js, TypeScript, PostgreSQL, and Firebase Firestore.

Database responsibilities:
PostgreSQL: Stores users, chats and chat membership.
Firebase Firestore: Stores messages, read receipts and last-seen information.

please visit:
- project structure
- Aleart: Development Guidelines
- API Discription
- warning


## Project Structure

```text
chat-backend/
│
├── src/
│   ├── config/
│   │   ├── database.ts
│   │   └── firebase.ts
│   │
│   ├── routes/
│   │   └── chatRoutes.ts
│   │
│   ├── app.ts
│   └── server.ts
│
├── .env
├── .gitignore
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

Directory and File Description

1. src/

Contains the main application source code written in TypeScript.

2. src/config/

Contains configuration files required for external services and database connections.
    database.ts – Handles MongoDB database connection using Mongoose.
    firebase.ts – Initializes Firebase Admin SDK for Firebase services and authentication-related operations.

3. src/routes/

Contains API route definitions.
chatRoutes.ts – Defines all six chat-related REST API endpoints.

4. src/app.ts

Initializes the Express application, Configures middleware such as CORS and JSON parsing, Registers chat API routes, Defines the root health-check endpoint.

5. src/server.ts

Loads environment variables, Establishes the MongoDB connection, Starts the Express server on the configured port.

6. Configuration Files

.env – Stores environment variables, database credentials, and Firebase configuration.
.gitignore – Prevents sensitive files, dependencies, and generated build files from being committed to Git.
package.json – Defines project dependencies, metadata, and npm scripts.
package-lock.json – Locks dependency versions for consistent installations.
tsconfig.json – Configures TypeScript compilation.
README.md – Contains project documentation and setup instructions.


# API Discription
1. Create Chat
    Purpose: Creates a one-to-one conversation between two users. Checks whether a conversation already exists before creating a new one.

    Endpoint: POST /create

    Request Body:

        {
            "userAId": "90b97d37-2fa8-4204-b058-045efb12a4de",
            "userBId": "f4318345-ff72-4ded-8929-8b9f8a913f38"
        }

    Success Response (201):
        {
        "success": true,
        "message": "Chat created successfully.",
        "chatId": "be4bdd71-0071-44d7-8cbd-13b268820c27"
        }

        if chat already exists between users 

        {
            "success": true,
            "message": "Chat already exists.",
            "chatId": "be4bdd71-0071-44d7-8cbd-13b268820c27"
        }

2. Send Message

    Purpose: Verifies chat membership and stores a new message in Firestore with sender information, timestamp and initial read receipt.

    Endpoint: POST /:chatId/message/send

    Request Body:

        {
            "senderId": "90b97d37-2fa8-4204-b058-045efb12a4de",
            "text": "Hello! This is my first message."
        }

    Success Response (201):

        {
            "success": true,
            "message": "Message sent successfully.",
            "messageId": "ETANSh6I26omufWCWnNr",
            "data": {
                "senderId": "90b97d37-2fa8-4204-b058-045efb12a4de",
                "text": "Hello! This is my first message.",
                "timestamp": "2026-11-19T08:17:15.085Z",
                "readBy": [
                    {
                        "userId": "90b97d37-2fa8-4204-b058-045efb12a4de",
                        "readAt": {
                            "_seconds": 1795076228,
                            "_nanoseconds": 488000000
                        }
                    }
                ]
            }
        }

3. Get Chat Messages

    Purpose: Retrieves messages from Firestore in ascending timestamp order.

    Endpoint: GET /:chatId/messages?limit=50

    Query Parameters:

        limit: Number of messages to retrieve (1–100, default 50).

        http://localhost:5000/chat/be4bdd71-0071-44d7-8cbd-13b268820c27/messages?limit=50

    Success Response (200):

        {
            "success": true,
            "count": 1,
            "messages": [
                {
                "messageId": "firestore_document_id",
                "senderId": "uuid",
                "text": "Hello!",
                "timestamp": "timestamp",
                "readBy": []
                }
            ]
        }

        example:

        {
            "success": true,
            "count": 2,
            "messages": [
                {
                    "messageId": "b0WHQGb4DmdSTuSk9U4b",
                    "senderId": "90b97d37-2fa8-4204-b058-045efb12a4de",
                    "text": "Hello! This is my first message.",
                    "timestamp": "2026-11-18T20:10:50.581Z",
                    "readBy": [
                        {
                            "userId": "90b97d37-2fa8-4204-b058-045efb12a4de",
                            "readAt": {
                                "_seconds": 1795032644,
                                "_nanoseconds": 58000000
                            }
                        },
                        {
                            "userId": "f4318345-ff72-4ded-8929-8b9f8a913f38",
                            "readAt": {
                                "_seconds": 1795032983,
                                "_nanoseconds": 44000000
                            }
                        }
                    ]
                }
            ]
        }


4. Mark Message as Read

    Purpose: Verifies chat membership and updates the message's readBy array using a Firestore transaction. Prevents duplicate read receipts for the same user.

    Endpoint: POST /:chatId/message/:messageId/read

    Request Body:

        {
            "userId": "f4318345-ff72-4ded-8929-8b9f8a913f38"
        }

    Success Response (200):

        {
            "success": true,
            "message": "Message marked as read."
        }

5. Update Last Seen

    Purpose: Tracks the last message viewed by each user in a conversation.

    Endpoint: POST /:chatId/lastseen

    Request Body:

        {
            "userId": "f4318345-ff72-4ded-8929-8b9f8a913f38",
            "messageId": "b0WHQGb4DmdSTuSk9U4b"
        }
    

    Success Response (200):

        {
            "success": true,
            "message": "Last seen updated successfully."
        }


6. Get User Chats
    Purpose: Retrieves all conversations associated with a user, including chat IDs, creation timestamps and member IDs.


    Endpoint: GET /user/:userId/chats

    example: http://localhost:5000/chat/user/90b97d37-2fa8-4204-b058-045efb12a4de/chats



    Success Response (200):

            {
                "success": true,
                "count": 1,
                "chats": [
                    {
                        "chatId": "be4bdd71-0071-44d7-8cbd-13b268820c27",
                        "createdAt": "2026-11-18T20:00:26.806Z",
                        "memberIds": [
                            "90b97d37-2fa8-4204-b058-045efb12a4de",
                            "f4318345-ff72-4ded-8929-8b9f8a913f38"
                        ]
                    }
                ]
            }


7. Bonus (soft delete message)

    Purpose: Allows a user to soft-delete a message from a conversation without permanently removing it from Firestore. The message is marked as deleted, preserving the underlying record.

    Endpoint: DELETE /chat/:chatId/message/:messageId

    http://localhost:5000/chat/be4bdd71-0071-44d7-8cbd-13b268820c27/message/DelipyD2p4egHPK908lG


    Request Body:

        {
            "userId": "90b97d37-2fa8-4204-b058-045efb12a4de"
        }
    
    Request body (JSON):

        {
            "success": true,
            "message": "Message deleted successfully."
        }

        if already deleted

        {
            "success": false,
            "message": "Message already deleted."
        }


8. Bonus (Edit Message)

    Purpose: Allows a user to edit their previously sent message by updating its text while retaining the existing message record in Firestore.

    Endpoint: PATCH /chat/:chatId/messages/:messageId

    http://localhost:5000/chat/be4bdd71-0071-44d7-8cbd-13b268820c27/message/E2AWn8o73QsLnghblMwG


    Request Body:
        {
            "userId": "90b97d37-2fa8-4204-b058-045efb12a4de",
            "text": "Updated message for 2"
        }

    Success Response (200):
        {
            "success": true,
            "message": "Message updated successfully."
        }

## Aleart:  Development Guidelines

1. Architecture: Follow a modular architecture. Separate routes, controllers, services, models, middleware and utilities. Routes should only connect endpoints to controllers.

2. Authentication & Authorization: Use established, production-ready libraries for authentication, token verification and authorization. Avoid custom implementations.

3. Encryption: Use HTTPS/TLS for frontend-backend communication. Use established cryptographic libraries for sensitive data and message encryption.

4. Documentation: Maintain separate documentation files in docs/. Avoid unnecessary code comments.

5. Logging: Avoid scattered console logs and logging inside business logic. Use centralized, structured logging only where necessary.

6. Error Handling: Implement centralized error handling and consistent API responses.

7. Security: Include input validation, rate limiting, secure environment variables, access control and database security.

8. Code Quality: Keep code clean, reusable, maintainable and production-ready. Avoid duplicated logic and unnecessary abstractions.

Objective: Build a secure, scalable, maintainable production-ready chat backend.


# warning
Do not create unnecessary files such as seedUsers.ts, schema.sql, or createTables.ts as part of the server runtime structure.

These files are generally intended for separate development or database management tasks, such as:
- seedUsers.ts – Initial user data seeding.
- schema.sql – Database schema definition or validation.
- createTables.ts – Database table creation.