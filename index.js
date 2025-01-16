const express = require('express');
const app = express();
const cors = require('cors');

const port = process.env.PORT || 5000;

// midleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Employee is running')
  })
  app.listen(port, () => {
    console.log(`Employee is running on port ${port}`);
  
  })