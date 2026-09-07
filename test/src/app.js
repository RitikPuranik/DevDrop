const express = require('express');
const user = require('./model/student.model')

const app = express();
app.use(express.json());

app.post('/post', async(req, res) => {
    const {name, email, password} = req.body;

    try{
        const priyuuu = new user({
        name,
        email,
        password
    })

    await priyuuu.save();

    res.send('Data saved successfully');
    }

    catch(err){
        console.log(err);
        res.status(500).send('Error saving data');
    }
})


app.get('/get', async(req, res) => {

    const data = await user.find();

    res.send(data);
})

app.put('/put/:id', async(req, res) => {

    const {id} = req.params;
    const data = req.body;

    const update = await user.findByIdAndUpdate(id, data)

    res.send(update);
})

app.delete('/delete/:id', async(req, res) => {

    const {id} = req.params;

    const del = await user.findByIdAndDelete(id);

    res.send(del,"Data deleted successfully");

})



module.exports = app;
