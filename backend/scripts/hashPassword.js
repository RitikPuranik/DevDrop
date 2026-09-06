const bcrypt = require("bcryptjs");

async function run() {
  const password = "priyal@123";
  const hash = await bcrypt.hash(password, 10);

  console.log(hash);
}

run();