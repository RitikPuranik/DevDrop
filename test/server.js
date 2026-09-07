const app = require('./src/app');
const connectDB = require('./src/db/db');

connectDB();

app.listen(3000, (req, res) =>{
    console.log('Server is running on port 3000');
})