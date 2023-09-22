const express = require('express');
const app = express();
const cors = require('cors');
const port = process.env.PORT || 3000;

app.use(cors());

app.get('/', (req, res) => {
    res.send('Time is talikg in different languages');
})

app.listen(port, () => {
    console.log('TalkTime is listenting on port:', port)
})