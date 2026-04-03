/**
 * Serves the static HoosOut site from the parent folder.
 */
var path = require("path");
var express = require("express");

var ROOT = path.join(__dirname, "..");
var app = express();
app.use(express.static(ROOT));

var PORT = Number(process.env.PORT || 3000);
app.listen(PORT, function () {
  console.log("HoosOut: http://localhost:" + PORT);
  console.log("Static files from:", ROOT);
});
