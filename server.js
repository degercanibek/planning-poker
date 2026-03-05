const path = require('path');
const express = require('express');
const app = require('./api/index');

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Planning Poker on http://localhost:' + PORT);
  console.log('Default login: admin / admin');
});
