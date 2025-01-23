const express = require('express');
const app = express();
const cors = require('cors');

// jwt-1
const jwt = require('jsonwebtoken');
require('dotenv').config();

const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;


// midleware
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wpavw.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const serviceCollection = client.db('employee-management').collection('services')
    const reviewCollection = client.db('employee-management').collection('reviews')
    const userCollection = client.db('employee-management').collection('users')
    const messagesCollection = client.db('employee-management').collection('messages')
    const tasksCollection = client.db('employee-management').collection('tasks')
    const paymentCollection = client.db('employee-management').collection('payment')


    // jwt related API---- JWT-2
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    })
    // middleware----------JWT-3
    const verifyToken = (req, res, next) => {
      // console.log('Inside VerifyToken', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'forbidden access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'forbidden-access' })
        }
        req.decoded = decoded;
        next();
      })
      // next();
    }

    // users related Api
    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null })
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    })
    app.get('/users', async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    // admin payment
    app.get("/users/payable", async (req, res) => {
      const users = await userCollection.find({ payable: true }).toArray();
      res.send(users);
    });

    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      if (!user) {
        return res.status(404).send({ message: 'User not found' });
      }
      res.send(user);
    });

    // make admin
    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'admin'
        }
      }
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    })
    // admin
    // make hr
    app.patch('/users/hr/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'HR'
        }
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });
    // Update user salary
    app.patch('/users/salary/:id', async (req, res) => {
      const { id } = req.params;
      const { salary } = req.body;

      if (!salary) {
        return res.status(400).send({ message: "Salary is required" });
      }

      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: { salary }
      };

      const result = await userCollection.updateOne(filter, updatedDoc);

      if (result.modifiedCount > 0) {
        res.send({ message: "Salary updated successfully" });
      } else {
        res.status(400).send({ message: "Failed to update salary" });
      }
    });
    
    

    app.get("/employees/:id", async (req, res) => {
      const { id } = req.params;
      const employee = await userCollection.findOne({ _id: new ObjectId(id) });
      if (!employee) {
        return res.status(404).json({ message: "Employee not found" });
      }
      res.json(employee);
    });


    // API: Create Payment Intent
    app.post('/create-payment-intent', async (req, res) => {
      const { amount } = req.body;
      if (!amount || amount <= 0) {
        return res.status(400).send({ message: 'Invalid amount' });
      }
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount,
          currency: 'usd',
        });
        res.send({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        console.error('Error creating PaymentIntent:', error.message);
        res.status(500).send({ message: 'Failed to create PaymentIntent' });
      }
    });

    app.post("/payments", async (req, res) => {
      const { transactionId, paidAmount, employeeName, employeeEmail } = req.body;
      if (!transactionId || !paidAmount || !employeeName || !employeeEmail) {
        return res.status(400).send({ message: "Required fields are missing." });
      }
      if (typeof paidAmount !== "number" || typeof transactionId !== "string") {
        return res.status(400).send({ message: "Invalid data types." });
      }
      const paymentData = {
        transactionId,
        paidAmount,
        employeeName,
        employeeEmail,
        paymentDate: new Date(),
      };
      const result = await paymentCollection.insertOne(paymentData);
      res.send(result);
    });


    app.get("/payment-history", async (req, res) => {
      const { email, page = 0, limit = 5 } = req.query;
      const pageNumber = parseInt(page);
      const limitNumber = parseInt(limit);
      try {
        const query = { employeeEmail: email };
        const payments = await paymentCollection.find(query).skip(pageNumber * limitNumber).limit(limitNumber).toArray();

        const enrichedPayments = payments.map((payment) => {
          const paymentDate = new Date(payment.paymentDate);
          return {
            ...payment,
            month: paymentDate.toLocaleString("default", { month: "long" }),
            year: paymentDate.getFullYear(),
          };
        });
        const totalRecords = await paymentCollection.countDocuments(query);
        const totalPages = Math.ceil(totalRecords / limitNumber);
        res.send({
          payments: enrichedPayments,
          totalPages,
        });
      } catch (error) {
        console.error("Error fetching payment history:", error);
        res.status(500).send({ message: "Internal server error." });
      }
    });





    // get by user role
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      try {
        const user = await userCollection.findOne({ email });
        if (user) {
          res.send({ role: user.role });
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Error retrieving user role" });
      }
    });

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'unauthorised access' })
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';

      }
      res.send({ admin })
    })

    // Fire employee
    app.patch('/users/fire/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: 'fired'
        }
      };
      const result = await userCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // Employee
    app.get('/tasks', async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ error: 'Email query parameter is required.' });
      }
      const tasks = await tasksCollection.find({ email }).toArray();
      res.send(tasks);
    });


    app.post('/tasks', async (req, res) => {
      const task = req.body;
      if (!task || !task.email || !task.task || !task.date) {
        return res.status(400).send({ error: 'Invalid task data.' });
      }
      const result = await tasksCollection.insertOne(task);
      res.send(result);
    });

    // Delete work by ID
    app.delete('/tasks/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await tasksCollection.deleteOne(filter);
      res.send(result);
    });

    app.put("/tasks/:id", async (req, res) => {
      const id = req.params.id;
      const { _id, ...updatedTask } = req.body;

      try {
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: updatedTask };
        const result = await tasksCollection.updateOne(filter, updateDoc);
        if (result.modifiedCount > 0) {
          res.status(200).send({ message: "Task updated successfully." });
        } else {
          res.status(404).send({ message: "Task not found or no changes made." });
        }
      } catch (error) {
        console.error("Error updating task:", error);
        res.status(500).send({ message: "Failed to update task." });
      }
    });


    // hr
    app.patch("/users/verify/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const employee = await userCollection.findOne({ _id: new ObjectId(id) });
        if (!employee) {
          return res.status(404).send({ message: "Employee not found" });
        }

        const updated = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { verified: !employee.verified } }
        );

        res.send({ success: true, verified: !employee.verified });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Error updating verification status" });
      }
    });

    app.get("/allWorkRecords", async (req, res) => {
      const tasks = await tasksCollection.find().toArray();
      res.send(tasks);
    });

    app.patch("/users/payable/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const updated = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { payable: true } }
        );
        res.send({ success: true });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Error marking employee as payable" });
      }
    });



    // services related API
    app.get('/services', async (req, res) => {
      const result = await serviceCollection.find().toArray();
      res.send(result);
    })

    // review related API
    app.get('/reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    })

    // contact us post
    app.post('/contact-us', async (req, res) => {
      const { name, email, message } = req.body;
      const newMessage = {
        name,
        email,
        message,
        date: new Date(),
      };
      const result = await messagesCollection.insertOne(newMessage);
      res.send(result);
    });

    app.get('/contact-us', async (req, res) => {
      const result = await messagesCollection.find().toArray();
      res.send(result);
    })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Employee is running')
})
app.listen(port, () => {
  console.log(`Employee is running on port ${port}`);

})