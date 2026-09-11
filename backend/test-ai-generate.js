const mongoose = require('mongoose');
const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('./src/modules/user/user.model');

async function main() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  });
  console.log('Connected to MongoDB.');

  let user = await User.findOne({ email: 'test_generator_user@example.com' });
  if (!user) {
    user = await User.findOne();
  }

  if (!user) {
    console.log('No user found. Creating a test user...');
    user = new User({
      name: 'Test Generator User',
      email: 'test_generator_user@example.com',
      password: 'test_generator_password',
      isVerified: true,
    });
    await user.save();
    console.log(`Created test user with ID: ${user._id}`);
  } else {
    console.log(`Using user with ID: ${user._id}, email: ${user.email}`);
  }

  // Generate token
  const token = jwt.sign({ userId: user._id.toString() }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
  console.log('Generated local JWT token.');

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');

  const payload = {
    messages: [
      {
        role: 'user',
        content: 'Build a beautiful, simple single-page developer portfolio website with basic sections.',
      },
    ],
  };

  console.log('Sending request to /api/ai-generate...');
  const startedAt = Date.now();
  try {
    const response = await axios.post('http://localhost:5000/api/ai-generate', payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 180000, // 3 minutes timeout
    });

    console.log('Received response from backend!');
    const data = response.data;
    if (data.success && data.data) {
      console.log('SUCCESS!');
      console.log('Assistant Message:', data.data.assistantMessage);
      console.log('Title:', data.data.title);
      console.log('Files generated:', Object.keys(data.data.files).length);
      console.log('Files list:', Object.keys(data.data.files));
      console.log('Elapsed time:', (Date.now() - startedAt) / 1000, 'seconds');
      process.exit(0);
    } else {
      console.error('Failed: response was not success.', data);
      process.exit(1);
    }
  } catch (error) {
    console.error('Request failed!');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error message:', error.message);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
