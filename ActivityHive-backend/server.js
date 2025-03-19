const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB URI & Client
const uri = "mongodb+srv://msharjeelzahid:Abacus41.@cluster0.zvz6v.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

// Collections
let lessonsCollection;
let ordersCollection;

// ✅ Connect to MongoDB
async function connectDB() {
  try {
    await client.connect();
    const db = client.db("lessonsDB");
    lessonsCollection = db.collection("lessons");
    ordersCollection = db.collection("orders");
    console.log("✅ Connected to MongoDB Atlas");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
}

// ✅ Search Lessons API
app.get("/search", async (req, res) => {
  try {
    const { query } = req.query;
    const results = await lessonsCollection.find({
      $or: [
        { subject: { $regex: query, $options: "i" } },
        { location: { $regex: query, $options: "i" } },
        { price: { $regex: query, $options: "i" } }
      ]
    }).toArray();
    res.json(results);
  } catch (err) {
    console.error("❌ Error searching lessons:", err);
    res.status(500).json({ error: "Failed to search lessons." });
  }
});

// ✅ Get All Lessons API
app.get("/lessons", async (req, res) => {
  try {
    const lessons = await lessonsCollection.find().toArray();
    res.json(lessons);
  } catch (err) {
    console.error("❌ Error fetching lessons:", err);
    res.status(500).json({ error: "Failed to fetch lessons" });
  }
});

// ✅ Place Order & Update Lesson Spaces API
app.post("/orders", async (req, res) => {
  const session = client.startSession();
  try {
    const { name, phone, address, city, state, zip, method, items } = req.body;
    console.log("📦 Received Order:", req.body);

    let allAvailable = true;
    for (const item of items) {
      const lesson = await lessonsCollection.findOne({ _id: new ObjectId(item.lessonId) });
      if (!lesson || lesson.space < item.quantity) {
        allAvailable = false;
        break;
      }
    }

    if (!allAvailable) {
      return res.status(400).json({ error: "Not enough space in one or more lessons." });
    }

    await session.withTransaction(async () => {
      const orderResult = await ordersCollection.insertOne({
        name,
        phone,
        address,
        city,
        state,
        zip,
        method,
        items
      }, { session });

      console.log("✅ Order placed with ID:", orderResult.insertedId);

      for (const item of items) {
        await lessonsCollection.updateOne(
          { _id: new ObjectId(item.lessonId) },
          { $inc: { space: -item.quantity } },
          { session }
        );
        console.log(`✅ Lesson ${item.lessonId} space reduced by ${item.quantity}`);
      }
    });

    res.json({ message: "Order placed successfully and lesson spaces updated!" });

  } catch (err) {
    console.error("❌ Error processing order:", err);
    res.status(500).json({ error: "Failed to place order and update lesson spaces." });
  } finally {
    await session.endSession();
  }
});

// ✅ Update Lesson Space API
app.put("/lessons/:id", async (req, res) => {
  try {
    const lessonId = req.params.id;
    const { space } = req.body;

    const result = await lessonsCollection.updateOne(
      { _id: new ObjectId(lessonId) },
      { $set: { space: space } }
    );

    if (result.modifiedCount > 0) {
      res.json({ message: "Lesson space updated successfully" });
    } else {
      res.status(404).json({ message: "Lesson not found" });
    }
  } catch (err) {
    console.error("❌ Error updating lesson space:", err);
    res.status(500).json({ error: "Failed to update lesson space." });
  }
});

// ✅ Start Server
connectDB().then(() => {
  app.listen(port, () => console.log(`🚀 Server running on http://localhost:${port}`));
});

