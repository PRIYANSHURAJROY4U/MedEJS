require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const ejs = require("ejs");
const passportLocalMongoose = require("passport-local-mongoose");
const passport = require("passport");
const session = require("express-session");
const { mongoose, User, Course, Request,Session } = require("./utils/db"); // Import from db.js
const nodemailer = require('nodemailer');
const mongodb = require("mongodb");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');
const axios = require('axios');
const FormData = require('form-data');
const sendEmail = require('./utils/email');
const setRoutes = require('./utils/routes');
const crypto = require('crypto');
const emailAuth = require('./utils/emailAuth');
const LocalStrategy = require("passport-local").Strategy; // Import LocalStrategy
const { log, error } = require('console');
const jwt = require('jsonwebtoken');
// const isAuthenticated = require('./utils/authMiddleware');
const bcrypt = require('bcrypt');
const JWT_SECRET = "med ejs is way to success";
const multer = require('multer');
const checkUserLoggedIn = require('./utils/authMiddleware');
const cookieParser = require('cookie-parser');
// const GridFsStorage = require('gridfs-stream');
const {GridFsStorage} = require('multer-gridfs-storage');
const courses = require('./utils/courses'); 
const { Types, connection } = require('mongoose');
const querystring = require('querystring');
const {saveEnquiry}= require('./utils/kit19Integration');
const { createCheckoutSession } = require('./utils/stripepay');
const isAuthenticated = require('./utils/isAuthenticatedMiddleware');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
let loggedIn = true;
// const enrollUserInCourse = require('./utils/enrollUser.js')
const app = express();
app.use(session({
  secret: "global med academy is way to success",
  resave: false,
  saveUninitialized: true
}));
// Use the middleware globally for all routes
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'ejs');
app.use(express.json());
// Serve static files from the 'public' directory
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(passport.initialize());
app.use(passport.session());
app.use(cookieParser());
app.use(checkUserLoggedIn);
passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: "https://globalmedacademy.com/auth/google/test",
  userProfileURL: "https://www.googleapis.com/oauth2/v2/userinfo"
},
  async (accessToken, refreshToken, profile, done) => {
    try {
      const user = await findOrCreateUser(profile);
      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }));

async function findOrCreateUser(profile) {
  const existingUser = await User.findOne({ googleId: profile.id });

  if (existingUser) {
    return existingUser;
  } else {
    const newUser = new User({
      googleId: profile.id,
      displayName: profile.displayName,
      // Set other fields as needed
    });
     // Set the signup method to 'google' for Google signups
     newUser.signupMethod = 'google';

    return newUser.save();
  }
};

// ends

app.get("/auth/google",
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

app.get("/auth/google/test",
  passport.authenticate('google', { failureRedirect: '/login' }),
  function (req, res) {
    // Successful authentication, redirect home.
    res.render('auth_index');
  }
);
app.get('/logout', (req, res) => {
  // Clear the authToken cookie
  res.clearCookie('authToken');

  // Destroy the session
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).send("Error logging out");
    }

    // Redirect to homepage or login page
    res.redirect('/');
  });
});


// Store generated OTP
let storedOTP = null;

app.use(express.json()); // Add this middleware to parse JSON in requests
app.post("/register", async (req, res) => {
  try {
    const { username, fullname, password } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: "User already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, fullname, password: hashedPassword });
    await newUser.save();

    // Generate and set the JWT token
    const token = jwt.sign({ userId: newUser._id }, JWT_SECRET);
    res.cookie('authToken', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // Cookie will expire after 24 hours

    createUserInMoodle(username, password, fullname, '.', username)
      .then(() => {
        req.session.save();
        passport.authenticate("local")(req, res, function () {
          res.render("auth_index", { username: username });
          getUserIdFromUsername(username);
        });
      })
      .catch((error) => {
        console.error(error);
        res.status(500).send("An error occurred during user registration.");
      });
  } catch (error) {
    console.error("Error while registering:", error);
    res.status(500).json({ error: "Error while registering" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET);
    // console.log("Generated Token:", token);
    // Set JWT token as a cookie
    res.cookie('authToken', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // Cookie will expire after 24 hours

    // Set username in the session
    req.session.username = username;
    // req.session.fullname= fullname;
    res.render("auth_index", { username: username });
  } catch (error) {
    console.error("Error while logging in:", error);
    res.status(500).json({ error: "Error while logging in" });
  }
});


const tokens = jwt.sign({ userId: User._id }, JWT_SECRET);
app.get("/becometeacher", verifyToken, (req, res) => {
  // res.json({ message: "You have access to this protected route!" });
  res.render("becometeacher");
});
// Middleware to verify JWT token from the request header
function verifyToken(req, res, next) {

  // const token = req.header("Authorization");
  const token = tokens;
  // const headers = {
  //   Authorization: `Bearer ${token}`,
  // };

  if (!token) {
    return res.status(401).json({ error: "Unauthorized - Token missing" });
  }

  jwt.verify(token, JWT_SECRET, (err, decodedToken) => {
    if (err) {
      return res.status(401).json({ error: "Unauthorized - Invalid token" });
    }
    req.userId = decodedToken.userId;
    next();
  });
}
async function isEmailRegistered(username) {
  // Use mongoose to query for a user with the provided email
  const user = await User.findOne({ username: username });

  // If a user is found, the email is already registered
  return user != null;
}

// Function to create a user in Moodle
async function createUserInMoodle(username, password, firstname, lastname, email) {
  const formData = new FormData();
  formData.append('moodlewsrestformat', 'json');
  formData.append('wsfunction', 'core_user_create_users');
  formData.append('wstoken', process.env.MOODLE_TOKEN); // Replace with your Moodle token
  formData.append('users[0][username]', username);
  formData.append('users[0][password]', password);
  formData.append('users[0][firstname]', firstname);
  formData.append('users[0][lastname]', lastname);
  formData.append('users[0][email]', email);
  formData.append('users[0][lang]', 'en');
  formData.append('users[0][description]', 'If you die you die');

  try {
    const response = await axios.post('https://moodle.upskill.globalmedacademy.com/webservice/rest/server.php', formData, {
      headers: formData.getHeaders()
    });
    console.log(response.data);
    // Perform any necessary actions based on the response
  } catch (error) {
    console.error(error);
    throw new Error('Failed to create user in Moodle.');
  }
}
const getUserIdFromUsername = async (email) => {
  const formData = new FormData();
  formData.append('moodlewsrestformat', 'json');
  formData.append('wsfunction', 'core_user_get_users_by_field');
  formData.append('wstoken', process.env.MOODLE_TOKEN);
  formData.append('field', 'username');
  formData.append('values[0]', email);

  try {
    const response = await axios.post('https://moodle.upskill.globalmedacademy.com/webservice/rest/server.php', formData, {
      headers: formData.getHeaders()
    });

    if (response.status === 200 && response.data.length > 0) {
      console.log('User ID:', response.data[0].id);
      return response.data[0].id;  // Returns the user ID
    } else {
      throw new Error('User not found.');
    }
  } catch (error) {
    console.log(error);
    throw new Error('Failed to retrieve user ID.');
  }
};
const otps = {};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'info@globalmedacademy.com',
    pass: process.env.EMAIL_PASS
  }
});

app.post('/send-otp', (req, res) => {
  const email = req.body.email;
  const otp = Math.floor(100000 + Math.random() * 900000);
  otps[email] = otp;

  const mailOptions = {
    from: 'info@globalmedacademy.com',
    to: email,
    subject: 'Your Verification Code',
    text: `Your verification code is ${otp}`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log(error);
      res.status(500).json({ message: 'Failed to send OTP' });
    } else {
      console.log('Email sent: ' + info.response);
      res.status(200).json({ message: 'OTP sent successfully' });
    }
  });
});

app.post('/verify-otp', (req, res) => {
  const email = req.body.email;
  const userOtp = req.body.otp;

  if (otps[email] === parseInt(userOtp, 10)) {
    delete otps[email];
    
    // Set the session variable to indicate that the email has been verified
    req.session.emailVerified = true;

    res.status(200).json({ message: 'OTP verified successfully' });
  } else {
    res.status(400).json({ message: 'Invalid OTP. Please try again!' });
  }
});


const enrollUserInCourse = async (userId, courseid) => {
  const formData = new FormData();
  formData.append('moodlewsrestformat', 'json');
  formData.append('wsfunction', 'enrol_manual_enrol_users');
  formData.append('wstoken', "3fecec7d7227a4369b758e917800db5d");
  formData.append('enrolments[0][roleid]', 5);
  formData.append('enrolments[0][userid]', userId);
  formData.append('enrolments[0][courseid]', courseid); // Fixed variable reference

  try {
    const response = await axios.post('https://moodle.upskill.globalmedacademy.com/webservice/rest/server.php', formData, {
      headers: formData.getHeaders()
    });

    if (response.status === 200) {
      console.log('User enrolled in the course successfully.');
      console.log(response.data);
    } else {
      console.log('Failed to enroll user in the course.');
      console.log(response.data);
    }
  } catch (error) {
    console.log(error);
    throw new Error('Failed to enroll user in the course.');
  }
};

app.get('/user', async function(req, res) {
  const pageTitle = 'User Profile';
  const metaRobots = '';
  const metaKeywords = '';
  const ogDescription = '';
  const canonicalLink = 'https://globalmedacademy.com/user';

  // Extract the JWT token from the cookie
  const token = req.cookies.authToken;
  if (!token) {
      return res.status(401).send('Unauthorized: No token provided');
  }

  let userId;
  try {
      // Verify and decode the token to get the user's ID
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
  } catch (error) {
      return res.status(401).send('Unauthorized: Invalid token');
  }

  try {
      // Fetch the user's details from the database using the userId
      const user = await User.findById(userId);
      if (!user) {
          return res.status(404).send('User not found');
      }

      // Extract coursesPurchased from the user or initialize it to an empty array if it doesn't exist
      const coursesPurchased = user.coursesPurchased || [];

      // Render the user page with the course names and other details
      res.render('user_Profile', {
          pageTitle,
          metaRobots,
          metaKeywords,
          ogDescription,
          canonicalLink,
          isUserLoggedIn: req.isUserLoggedIn,
          username: user.username,  // Use the username from the fetched user data
          fullname: user.fullname,  // Similarly, use the fullname from the fetched user data
          coursesPurchased  // Pass the coursesPurchased to the EJS template
      });
  } catch (error) {
      console.error("Error fetching user's courses:", error);
      res.status(500).send('Server Error');
  }
});

// Usage
const userId = '15'; // Replace with the actual user ID
const courseid = '9'; // Replace with the actual Course ID


//  multer config ends here 

//Kit19Integration
app.post('/submitRequestForMore', async (req, res) => {
  try {
      const response = await saveEnquiry(req.body);

      console.log("Kit19 Response:", response);  // Log the entire response

      if (response.data.Status === 0) {
        res.send('Form data submitted successfully. Redirecting to the homepage...<meta http-equiv="refresh" content="2;url=/">');
      } else {
          res.status(400).send('Failed to save enquiry.');
      }
  } catch (error) {
      console.error('Error:', error);
      res.status(500).send('Internal server error.');
  }
});

//  lolo
app.get('/buy-now/:courseID', async (req, res) => {
  const courseID = req.params.courseID;
  const course = courses.find(c => c.courseID === courseID);

  if (!course) {
    return res.status(404).send('Course not found');
  }

  const line_items = [{
    price_data: {
      currency: course.currency,
      product_data: {
        name: course.name,
      },
      unit_amount: course.price,
    },
    quantity: 1,
  }];

  try {
    const success_url = `http://localhost:3000/success?session_id={CHECKOUT_SESSION_ID}&courseID=${courseID}`;
    const cancel_url = 'http://localhost:3000/cancel';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: line_items,
      mode: 'payment',
      success_url: success_url,
      cancel_url: cancel_url,
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error(error);
    res.status(500).send('Error creating checkout session');
  }
});




app.post('/webhook', bodyParser.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, 'whsec_abbb919e09c71cb6e2399c58dbf51a71e0666987a3a49ebe0c143f190e152cbb');
  } catch (err) {
    console.error('Error constructing event:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // Log the successful payment for security or auditing purposes
    console.log('Payment Successful:', session.id);
    
    // Optionally, perform any other security-related tasks or verifications here
    
  } else {
    // Handle other event types as necessary
    console.log('Received event:', event.type);
  }
  
  // Always respond with 200 OK to acknowledge receipt of the event
  res.json({received: true});
});



app.get('/success', async (req, res) => {
  const sessionId = req.query.session_id;
  const courseID = req.query.courseID; // Extract courseID from the URL
  
  if (!sessionId || !courseID) {
    return res.status(400).send('Session ID and Course ID are required');
  }

  // Extract the JWT token from the cookie
  const token = req.cookies.authToken;
  if (!token) {
    return res.status(401).send('Unauthorized: No token provided');
  }

  let userId;
  try {
    // Verify and decode the token to get the user's ID
    const decoded = jwt.verify(token, JWT_SECRET);
    userId = decoded.userId;
  } catch (error) {
    return res.status(401).send('Unauthorized: Invalid token');
  }

  try {
    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    // Verify if the payment was successful
    if (session.payment_status !== 'paid') {
      return res.status(400).send('Payment was not successful');
    }
    
    // Find the course and the user, then add the course to the user's purchased courses
    const course = await Course.findById(courseID);
    if (!course) return res.status(404).send('Course not found');
    
    const courseName = course.title;
    const user = await User.findByIdAndUpdate(userId, {
      $addToSet: { coursesPurchased: courseName }
    }, { new: true });
    
    if (!user) {
      console.error('User not found:', userId);
      return res.status(404).send('User not found');
    }
    
    // Redirect to the user page or another appropriate page with a success message
    res.redirect('/user?message=Payment is successful!');
  } catch (error) {
    console.error('Error in success route:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/cancel', (req, res) => {
  // Define the message and the redirect URL to the home route
  const message = 'Payment Unsuccessful!';
  const redirectUrl = '/'; // Redirect to the home URL
  
  // Send a simple HTML response with a script to redirect after a delay
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="UTF-8">
    <title>${message}</title>
    <style>
      body {
        margin: 0;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #f0f0f0;
      }
      #message-container {
        text-align: center;
      }
    </style>
    </head>
    <body>
    <div id="message-container">
      <p>${message}</p>
    </div>
    <script>
      setTimeout(() => {
        window.location.href = '${redirectUrl}';
      }, 3000);
    </script>
    </body>
    </html>
  `);
});

  






















const url = process.env.MONGODB_URI;
const storage = new GridFsStorage({ url });
const upload = multer({ storage });

app.get("/data", isAuthenticated, (req, res) => {
  res.render("data");
});



app.post('/data', upload.fields([
  { name: 'aadharCard' },
  { name: 'panCard' },
  { name: 'medicalCertificate' },
  { name: 'mciCertificate' }
]), async (req, res) => {
  // Extract the JWT token from the cookie
  const token = req.cookies.authToken;
  if (!token) {
    return res.status(401).send('Unauthorized: No token provided');
  }

  let userId;
  try {
    // Verify and decode the token to get the user's ID
    const decoded = jwt.verify(token, JWT_SECRET);
    userId = decoded.userId;
  } catch (error) {
    return res.status(401).send('Unauthorized: Invalid token');
  }

  try {
    // Prepare the uploadedFiles array with the uploaded files information
    const uploadedFiles = [];
    if (req.files.aadharCard) uploadedFiles.push({ ...req.files.aadharCard[0], title: 'Aadhar Card' });
    if (req.files.panCard) uploadedFiles.push({ ...req.files.panCard[0], title: 'Pan Card' });
    if (req.files.medicalCertificate) uploadedFiles.push({ ...req.files.medicalCertificate[0], title: 'Medical Certificate' });
    if (req.files.mciCertificate) uploadedFiles.push({ ...req.files.mciCertificate[0], title: 'MCI Certificate' });

    // Find the user by ID and update the uploadedFiles array
    const user = await User.findByIdAndUpdate(userId, {
      $push: { uploadedFiles: { $each: uploadedFiles } }
    }, { new: true });

    if (!user) {
      console.error('User not found:', userId);
      return res.status(404).send('User not found');
    }

    // Redirect to the user page or another appropriate page with a success message
    res.redirect('/user?message=Files uploaded successfully!');
  } catch (error) {
    console.error('Error in upload route:', error);
    res.status(500).send('Internal Server Error');
  }
});



app.listen(3000, function () {
  console.log("Server started successfully!");
});
setRoutes(app);
