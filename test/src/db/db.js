const mongoose = require('mongoose');

const connectDB = () =>{
    mongoose.connect('mongodb://localhost:27017/test')
    console.log('Database connected successfully');
}

module.exports = connectDB;