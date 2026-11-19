import express from "express";
import cors from "cors"

import chatRoutes from "./routes/chatRoutes";

const app = express();

app.use(cors());
app.use(express.json());
app.use("/chat", chatRoutes);

app.get("/", (req, res) => {
    res.status(200).json({
        success: true, message: "server started....."
    });
});

export default app;