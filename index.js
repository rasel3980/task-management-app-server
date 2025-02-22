const express = require('express');
const http = require('http');
const ws = require('ws');
require('dotenv').config();
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb'); // Corrected import
const cors = require('cors');
const port = process.env.PORT || 5000;

// middleware
const app = express();
app.use(cors());
app.use(express.json());

// Create a server to run both Express and WebSocket
const server = http.createServer(app);

// Create a WebSocket server
const wss = new ws.Server({ server });

// MongoDB setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.n4ll4.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const usersCollection = client.db("Task_Management").collection("users");
    const tasksCollection = client.db("Task_Management").collection("tasks");

    // WebSocket connection handling
    wss.on('connection', (wsClient) => {
      console.log('A client connected to WebSocket');
      
      // Send a welcome message to the connected client
      wsClient.send(JSON.stringify({ message: 'Welcome to the Task Management WebSocket server!' }));

      // Handle task updates and broadcasting to clients
      wsClient.on('message', (message) => {
        const parsedMessage = JSON.parse(message);

        if (parsedMessage.action === 'taskUpdated') {
          // Broadcast task updates to all connected clients
          wss.clients.forEach((client) => {
            if (client.readyState === ws.OPEN) {
              client.send(JSON.stringify({
                action: 'taskUpdated',
                task: parsedMessage.task
              }));
            }
          });
        }

        if (parsedMessage.action === 'taskDeleted') {
          // Broadcast task deletion to all connected clients
          wss.clients.forEach((client) => {
            if (client.readyState === ws.OPEN) {
              client.send(JSON.stringify({
                action: 'taskDeleted',
                taskId: parsedMessage.taskId
              }));
            }
          });
        }
      });
      
      // Handle client disconnection
      wsClient.on('close', () => {
        console.log('A client disconnected');
      });
    });

    // User Registration or Login (existing user)
    app.post('/user/:email', async (req, res) => {
        const email = req.params.email;
        const query = { email };
        const user = req.body;
        const isExist = await usersCollection.findOne(query);
        if (isExist) {
          return res.send(isExist);
        }
        const result = await usersCollection.insertOne({
          ...user,
          timestamp: Date.now(),
        });
        res.send(result);
    });

    // Get all tasks for a user
    app.get('/tasks', async (req, res) => {
        const { userId } = req.query;
        const query = { userId };
        const tasks = await tasksCollection.find(query).toArray();
        res.json(tasks);
    });

    // Create a new task
    app.post('/tasks', async (req, res) => {
        const task = req.body;
        const result = await tasksCollection.insertOne({
            ...task,
            timestamp: Date.now(),
        });

        // Notify WebSocket clients about the new task
        wss.clients.forEach((client) => {
          if (client.readyState === ws.OPEN) {
            client.send(JSON.stringify({
              action: 'taskCreated',
              task: result.ops[0]  
            }));
          }
        });

        res.status(201).json(result);
    });

    // Update a task
    app.put('/tasks/:id', async (req, res) => {
    const taskId = req.params.id;
    const updatedTask = req.body;
  
    // Remove _id from the updatedTask to avoid the immutable field error
    delete updatedTask._id;
  
    try {
      const result = await tasksCollection.updateOne(
        { _id: new ObjectId(taskId) },
        { $set: updatedTask }
      );
  
      if (result.modifiedCount === 0) {
        return res.status(404).send({ message: "Task not found" });
      }
  
      // Notify WebSocket clients about the updated task
      wss.clients.forEach((client) => {
        if (client.readyState === ws.OPEN) {
          client.send(JSON.stringify({
            action: 'taskUpdated',
            task: updatedTask
          }));
        }
      });
  
      res.json({ message: "Task updated successfully", task: updatedTask });
    } catch (err) {
      console.error("Error updating task:", err);
      res.status(500).send({ message: "Internal server error" });
    }
  });
  
    

    // Delete a task
    app.delete('/tasks/:id', async (req, res) => {
        const taskId = req.params.id;
        const result = await tasksCollection.deleteOne({ _id: new ObjectId(taskId) });

        if (result.deletedCount === 0) {
            return res.status(404).send({ message: "Task not found" });
        }

        // Notify WebSocket clients about the task deletion
        wss.clients.forEach((client) => {
          if (client.readyState === ws.OPEN) {
            client.send(JSON.stringify({
              action: 'taskDeleted',
              taskId: taskId
            }));
          }
        });

        res.json({ message: "Task deleted successfully" });
    });

    // Connect to MongoDB
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensure the client will close when you finish/error
    // await client.close();
  }
}

// Test route to ensure everything works
app.get('/', (req, res) => {
    res.send('Task Management API is running');
});

// Start server and WebSocket server
server.listen(port, () => {
    console.log(`Task Management API is running on port ${port}`);
});

run().catch(console.dir);
