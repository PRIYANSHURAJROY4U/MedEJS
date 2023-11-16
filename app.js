require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const ejs = require("ejs");
const passportLocalMongoose = require("passport-local-mongoose");
const passport = require("passport");
const cookieSession = require('cookie-session')
const { mongoose, User, Course, Request, Session, UserSession, InstructorApplication } = require("./utils/db"); // Import from db.js
const db = require('./utils/db');
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
const { GridFsStorage } = require('multer-gridfs-storage');
const courses = require('./utils/courses');
const { Types, connection } = require('mongoose');
const querystring = require('querystring');
const { saveEnquiry } = require('./utils/kit19Integration');
const { createCheckoutSession } = require('./utils/stripepay');
const isAuthenticated = require('./utils/isAuthenticatedMiddleware');
const getUniqueEnrollmentNumber = require('./utils/enrollmentNumber');
const forestAdmin = require('./utils/forestAdmin');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const rawBodyParser = bodyParser.raw({ type: '*/*' });
const flash=require('connect-flash');
let loggedIn = true;
const { enrollUserInCourse } = require('./utils/enrollUser.js')
const app = express();
app.use(cookieSession({
  name: 'session',
  keys: ['medEjs is way to success'], // Replace with your secret key
  // secure: process.env.NODE_ENV === 'production',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  // httpOnly:true
}));
forestAdmin.mountOnExpress(app).start();
// Use the middleware globally for all routes
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'ejs');
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use(passport.initialize());
app.use(passport.session());
app.use(cookieParser());
app.use(flash());
app.use(checkUserLoggedIn);
app.set('trust proxy', true);
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  res.locals.error = req.flash('error');
  next();
});

passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: "https://globalmedacademy.com/auth/google/callback"
},
async (accessToken, refreshToken, profile, done) => {
  try {
    const user = await findOrCreateUser(profile);
    return done(null, user);
  } catch (error) {
    return done(error, null);
  }
}
));

async function findOrCreateUser(profile) {
const existingUser = await User.findOne({ googleId: profile.id });

if (existingUser) {
  return existingUser;
} else {
  const newUser = new User({
    googleId: profile.id,
    displayName: profile.displayName,
    // Add additional fields as in your regular registration process
    enrollmentNumber: await getUniqueEnrollmentNumber(),
    // Other fields...
  });

  newUser.signupMethod = 'google';
  return newUser.save();
}
}
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});
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
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', async (err, user, info) => {
    if (err) { return next(err); }
    if (!user) { return res.redirect('/login'); }

    try {
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
      res.cookie('authToken', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });

      if (user.isNewUser) {
        const username = user.email;  
        const password = generatePassword(); // Ensure this method exists
        const fullname = user.displayName;

        await createUserInMoodle(username, password, fullname, '.', username);
        // Additional logic for new users
      }

      // Render the page with meta information
      res.render("auth_index", {
        username: user.displayName,
        pageTitle: 'Fellowship Course, Online Medical Certificate Courses - GlobalMedAcademy',
        metaRobots: 'follow, index, max-snippet:-1, max-video-preview:-1, max-image-preview:large',
        metaKeywords: 'certificate courses online, fellowship course, fellowship course details, fellowship in diabetology, critical care medicine, internal medicine',
        ogDescription: 'GlobalMedAcademy is a healthcare EdTech company. We provide various blended learning medical fellowship, certificate courses, and diplomas for medical professionals',
        canonicalLink: 'https://globalmedacademy.com/',
        isBlogPage: false
      });
    } catch (error) {
      console.error("Error after Google authentication:", error);
      res.status(500).send("An error occurred after Google authentication.");
    }
  })(req, res, next);
});
const generatePassword = (length = 10) => {
  if (length < 8) length = 8; // Ensure minimum length of 8

  const numbers = "0123456789";
  const lowerCaseLetters = "abcdefghijklmnopqrstuvwxyz";
  const upperCaseLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const symbols = "!@#$%^&*()_+~`|}{[]:;?><,./-=";
  const allChars = numbers + lowerCaseLetters + upperCaseLetters + symbols;

  let password = "";
  password += numbers.charAt(Math.floor(Math.random() * numbers.length));
  password += lowerCaseLetters.charAt(Math.floor(Math.random() * lowerCaseLetters.length));
  password += upperCaseLetters.charAt(Math.floor(Math.random() * upperCaseLetters.length));
  password += symbols.charAt(Math.floor(Math.random() * symbols.length));

  for (let i = password.length; i < length; ++i) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }

  // Shuffle the password to mix up the order of characters
  password = password.split('').sort(() => 0.5 - Math.random()).join('');

  return password;
};



app.get('/logout', async (req, res) => {
  try {
    // Clear the authToken cookie
    res.clearCookie('authToken');

    // Extract the JWT token from the cookie
    const token = req.cookies.authToken;
    if (token) {
      await UserSession.findOneAndDelete({ token });
    }

    // Clear the session
    req.session = null;

    // Redirect to homepage or login page
    res.redirect('/');
  } catch (error) {
    console.error("Error during logout:", error);
    res.status(500).send("Error logging out");
  }
});




// Store generated OTP
let storedOTP = null;

// Add this middleware to parse JSON in requests
app.post("/register", async (req, res) => {
  const pageTitle = 'Fellowship Course, Online Medical Certificate Courses - GlobalMedAcademy';
  const metaRobots = 'follow, index, max-snippet:-1, max-video-preview:-1, max-image-preview:large';
  const metaKeywords = 'certificate courses online, fellowship course, fellowship course details, fellowship in diabetology, critical care medicine, internal medicine ';
  const ogDescription = 'GlobalMedAcademy is a healthcare EdTech company. We provide various blended learning medical fellowship, certificate courses, and diplomas for medical professionals';
  const canonicalLink = 'https://globalmedacademy.com/';
  try {
    const { username, fullname, password } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const enrollmentNumber = await getUniqueEnrollmentNumber(); // Get unique enrollment number

    const newUser = new User({
      username,
      fullname,
      password: hashedPassword,
      enrollmentNumber  // Assign enrollment number
    });

    await newUser.save();

    // Generate and set the JWT token
    const token = jwt.sign({ userId: newUser._id }, JWT_SECRET);
    res.cookie('authToken', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // Cookie will expire after 24 hours

    createUserInMoodle(username, password, fullname, '.', username)
      .then(() => {
        passport.authenticate("local")(req, res, function () {
          res.redirect('/user');
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
  const pageTitle = 'Fellowship Course, Online Medical Certificate Courses - GlobalMedAcademy';
  const metaRobots = 'follow, index, max-snippet:-1, max-video-preview:-1, max-image-preview:large';
  const metaKeywords = 'certificate courses online, fellowship course, fellowship course details, fellowship in diabetology, critical care medicine, internal medicine ';
  const ogDescription = 'GlobalMedAcademy is a healthcare EdTech company. We provide various blended learning medical fellowship, certificate courses, and diplomas for medical professionals';
  const canonicalLink = 'https://globalmedacademy.com/';
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Get the IP address of the user
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // Get the User-Agent string of the user
    const userAgent = req.headers['user-agent'];

    // Check if there is already an active session for this user with the same IP address and User-Agent string
    const existingSession = await UserSession.findOne({ userId: user._id, ipAddress, userAgent });
    if (existingSession) {
      return res.status(403).json({ success: false, message: "User already logged in from a different browser or location. Please logout to continue." });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET);
    res.cookie('authToken', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 });

    // Create a new session with ipAddress and userAgent included
    const newUserSession = new UserSession({ userId: user._id, token, ipAddress, userAgent });
    await newUserSession.save();

    req.session.username = username;

    // Render the page and end the response
    return res.json({ success: true, redirectUrl: '/' });
  } catch (error) {
    console.error("Error while logging in:", error);
    return res.status(500).json({ success: false, message: "Error while logging in" });
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

app.post('/send-otp', async (req, res) => {
  const email = req.body.email;

  try {
    // Check if email is already registered
    const user = await User.findOne({ username: email }); // Changed from email to username

    if (user) {
      // Email is already registered
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Email is not registered, proceed with sending OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    otps[email] = otp;

    const mailOptions = {
      from: 'info@globalmedacademy.com',
      to: email,
      subject: 'Your Verification Code',
      text: `Your verification code is ${otp}`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent: ' + info.response);
    res.status(200).json({ message: 'OTP sent successfully' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error processing request' });
  }
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
app.post('/apply-as-instructor', async (req, res) => {
  // Extract form data from req.body
  const {
    firstName,
    lastName,
    city,
    country,
    graduationDegree,
    specialization,
    lastDegree,
    medicalCollege,
    interestIn,
    email,
    mobile,
  } = req.body;

  // Create a new instructor application
  const newApplication = new InstructorApplication({
    firstName,
    lastName,
    city,
    country,
    graduationDegree,
    specialization,
    lastDegree,
    medicalCollege,
    interestIn,
    email,
    mobile,
  });

  try {
    await newApplication.save();
    res.status(200).json({ message: 'Application submitted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error saving application' });
  }
});
// app.js

// ... other code ...

app.post("/refer-and-earn", async (req, res) => {
  try {
      const { friendMobile, friendName, recommendedCourse, enrollmentNumber } = req.body;
      
      // Validate data as needed
      
      // Find the logged-in user using the provided enrollmentNumber
      const user = await User.findOne({ enrollmentNumber });
      
      if (!user) {
          // Handle case where user is not found
          return res.status(400).send("User not found");
      }
      
      // Update user data
      // Example: Add friend's details to a 'referrals' array in user document
      user.referrals = user.referrals || [];
      user.referrals.push({ friendMobile, friendName, recommendedCourse });
      
      await user.save();
      
      // Redirect or render a page as needed
      res.json({ success: true });
    } catch (error) {
        console.error("Error while submitting referral:", error);
        // Send an error response
        res.status(500).json({ success: false, error: "Error while submitting referral" });
    }
});

// ... other code ...


// const enrollUserInCourse = async (userId, courseid) => {
//   const formData = new FormData();
//   formData.append('moodlewsrestformat', 'json');
//   formData.append('wsfunction', 'enrol_manual_enrol_users');
//   formData.append('wstoken', "3fecec7d7227a4369b758e917800db5d");
//   formData.append('enrolments[0][roleid]', 5);
//   formData.append('enrolments[0][userid]', userId);
//   formData.append('enrolments[0][courseid]', courseid); // Fixed variable reference

//   try {
//     const response = await axios.post('https://moodle.upskill.globalmedacademy.com/webservice/rest/server.php', formData, {
//       headers: formData.getHeaders()
//     });

//     if (response.status === 200) {
//       console.log('User enrolled in the course successfully.');
//       console.log(response.data);
//     } else {
//       console.log('Failed to enroll user in the course.');
//       console.log(response.data);
//     }
//   } catch (error) {
//     console.log(error);
//     throw new Error('Failed to enroll user in the course.');
//   }
// };

app.get('/user', async function (req, res) {
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
    const coursesPurchased = user.coursesPurchased || [];

    // Check if the user has purchased any courses
    const hasPurchasedCourses = coursesPurchased.length > 0;

    // Check if the user has uploaded the required documents
    const documentsUploaded = user.uploadedFiles && user.uploadedFiles.length > 0;
    // Split the full name and take the first part (first name)
    const firstName = user.fullname.split(' ')[0];

    // Render the user page with the course names and other details
    res.render('user_Profile', {
      pageTitle,
      metaRobots,
      metaKeywords,
      ogDescription,
      canonicalLink,
      firstname: firstName,
      isUserLoggedIn: req.isUserLoggedIn,
      username: user.username,
      fullname: user.fullname,
      enrollmentNumber:user.enrollmentNumber,
      coursesPurchased,
      documentsUploaded,
      hasPurchasedCourses,
      isBlogPage: false // Pass the documentsUploaded to the EJS template
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
  // const course = courses.find(c => c.courseID === courseID);
  const course = await db.Course.findOne({ courseID: courseID });
  if (!course) {
    return res.status(404).send('Course not found');
  }

  const line_items = [{
    price_data: {
      currency: course.currency,
      product_data: {
        name: course.name,
      },
      unit_amount: course.discountedPrice,
    },
    quantity: 1,
  }];

  try {
    
    const success_url = `http://www.globalmedacademy.com/success?session_id={CHECKOUT_SESSION_ID}&courseID=${courseID}`;
    const cancel_url = 'http://www.globalmedacademy.com/cancel';
   
    const token = req.cookies.authToken;
      if (!token) {
          return res.status(401).send('Unauthorized: No token provided');
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId);
      if (!user) {
          return res.status(404).send('User not found');
      }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: user.username,
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
app.get('/send-payment-link/:courseID', async (req, res) => {
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
          unit_amount: course.discountedPrice,
      },
      quantity: 1,
  }];

  try {
    const success_url = `http://www.globalmedacademy.com/success?session_id=${CHECKOUT_SESSION_ID}&courseID=${courseID}`;
    const cancel_url = 'http://www.globalmedacademy.com/cancel';
    

      // Extract the JWT token from the cookie to get the user's email
      const token = req.cookies.authToken;
      if (!token) {
          return res.status(401).send('Unauthorized: No token provided');
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId);
      if (!user) {
          return res.status(404).send('User not found');
      }
       
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: user.username,
        line_items: line_items,
        mode: 'payment',
        success_url: success_url,
        cancel_url: cancel_url,
    });
      // Send the payment link to the user's email
      sendEmail({
        to: [user.username],
        subject: 'Your Payment Link',
        text: `Click here to make your payment: ${session.url}`
    });
      res.send('Payment link sent to your email! You may close this page .');

  } catch (error) {
      console.error(error);
      res.status(500).send('Error creating checkout session');
  }
});
// Endpoint for handling Stripe webhook events
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_SIGNING_SECRET);
  } catch (err) {
    if (err instanceof stripe.errors.StripeSignatureVerificationError) {
      // Invalid signature
      console.error('Invalid signature:', err);
      return res.status(400).send('Invalid signature');
    } else if (err instanceof SyntaxError) {
      // Invalid payload
      console.error('Invalid payload:', err);
      return res.status(400).send('Invalid payload');
    } else {
      console.error('Error constructing event:', err);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('Payment Successful:', paymentIntent.id);
      break;
    // ... handle other event types ...
    default:
      console.log("Unhandled event type:", event.type);
  }

  // Always respond with 200 OK to acknowledge receipt of the event
  res.json({ received: true });
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
    const course = await Course.findOne({ courseID: courseID });

    if (!course) return res.status(404).send('Course not found');

    const courseName = course.name;

    const user = await User.findByIdAndUpdate(userId, {
      $addToSet: { coursesPurchased: courseName }
    }, { new: true });

    if (!user) {
      console.error('User not found:', userId);
      return res.status(404).send('User not found');
    }

    // Enroll the user in the Moodle course with category number D1
    await enrollUserInCourse(user.username, '12');

    // Send a payment receipt to the user
    sendEmail({
        to: [user.username],
        subject: 'Your Payment Receipt',
        text: `Thank you for purchasing the course. Your payment was successful! We will send you the receipt!`
    });

    // Send a new enrollment message to the admin
    sendEmail({
      to: 'onlinemedcourses@gmail.com',
      subject: 'New User Enrollment',
      text: `A new user has enrolled in the course. \n\nUser Email: ${user.username}\nCourse: ${courseName}\nPayment Status: Successful`
    });

    // Redirect to the user page or another appropriate page with a success message
    res.redirect('/user?message=Payment is successful!');
  } catch (error) {
    console.error('Error in success route:', error);
    res.status(500).send('Internal Server Error');
  }
});



//testing flash popup


app.get('/test',function(req,res){
res.render('form',{messages:req.flash()});
})
app.post('/test/submit', function(req, res) {
  let message = "";
  if (req.body.username.toLowerCase() === 'aryaman') {
      message = 'Welcome Aryaman!';
  } else {
      message = 'User not recognised';
  }
  req.flash('message', message);
  return res.redirect('/test');
});




// app.use(express.json());
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

// Your forgot password endpoint
app.post('/forgot-password', async (req, res) => {
  const { username } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).send('User with given email does not exist.');
    }

    const token = jwt.sign({ _id: user._id },JWT_SECRET, { expiresIn: '1h' });

    await User.updateOne({ _id: user._id }, {
      resetPasswordToken: token,
      resetPasswordExpires: Date.now() + 3600000 // 1 hour
    });

    const resetLink = `${req.headers.origin}/reset-password/${token}`;
    const emailBody = `<p>Please use the following link to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p>`;

    // Send email
    sendEmail({
      to: user.username,
      subject: 'Password Reset Link',
      text: `Please use the following link to reset your password: ${resetLink}`,
      html: emailBody
    });

    res.send('Password reset link has been sent to your email address.');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error on forgot password.');
  }
});

// GET route to render the password reset form
app.get('/reset-password/:token', async (req, res) => {
  const pageTitle = 'Reset your password';
    const metaRobots = 'follow, index, max-snippet:-1, max-video-preview:-1, max-image-preview:large';
    const metaKeywords = '';
    const ogDescription = '';
    const canonicalLink = 'https://www.globalmedacademy.com/forgot-password';
  const { token } = req.params;
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Token decoded:', decoded);
    const user = await User.findOne({
      _id: decoded._id,
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });
    if (!user) {
      console.log('No user found or token expired for user ID:', decoded._id);
      return res.status(400).send('Password reset token is invalid or has expired.');
    }
    // Render the reset password form
    res.render('reset_password', { token, pageTitle,
      metaRobots,
      metaKeywords,
      ogDescription,
      canonicalLink,
      isBlogPage: false, });
  } catch (error) {
    console.error('Error verifying token:', error);
    return res.status(400).send('Invalid token.');
  }
});

// Your POST route to handle password reset form submission
app.post('/reset-password/:token', async (req, res) => {
  const { password } = req.body;
  const { token } = req.params;

  try {
    // Verify JWT token and get user
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOne({
      _id: decoded._id,
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      console.log('Password reset token is invalid or has expired.');
      // Redirect with error message
      return res.redirect(`/reset-password/${token}?message=${encodeURIComponent('Password reset token is invalid or has expired.')}`);
    }

    // Hash new password for local application
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update password in local application
    await User.updateOne({ _id: user._id }, {
      password: hashedPassword,
      resetPasswordToken: null,
      resetPasswordExpires: null
    });

    console.log(`Local password updated for user: ${user.username}`);

    // Now update the password in Moodle
    try {
      const moodleResponse = await updateMoodlePassword(user.username, password);
      console.log('Moodle response:', moodleResponse);
      // Check if the Moodle response indicates success
      if (moodleResponse && moodleResponse.exception) {
        console.error('Moodle password update failed with exception:', moodleResponse);
        // Redirect with Moodle error message
        return res.redirect(`/reset-password/${token}?message=${encodeURIComponent('Your local password has been updated, but there was an error updating your Moodle password.')}`);
      } else {
        console.log(`Moodle password updated for user: ${user.username}`);
        // Redirect to login route after successful password reset with success message
        return res.redirect(`/loginn?message=${encodeURIComponent('Your password has been successfully reset.')}`);
      }
    } catch (moodleError) {
      // Handle the case where the Moodle password update fails
      console.error('Moodle password update failed:', moodleError);
      // Redirect with Moodle error message
      return res.redirect(`/reset-password/${token}?message=${encodeURIComponent('Your local password has been updated, but there was an error updating your Moodle password.')}`);
    }

  } catch (error) {
    console.error('Error resetting password:', error);
    // Redirect with generic error message
    return res.redirect(`/reset-password/${token}?message=${encodeURIComponent('Error resetting password.')}`);
  }
});

























const url = process.env.MONGODB_URI;
const storage = new GridFsStorage({ url });
const upload = multer({ storage });

app.get('/upload-documents', isAuthenticated, (req, res) => {
  const pageTitle = 'Upload Documents';
  const metaRobots = '';
  const metaKeywords = '';
  const ogDescription = '';
  const canonicalLink = 'https://globalmedacademy.com/upload-documents';
  const courseID = req.query.courseID || '';
  const username = req.session.username || null;
  let firstname = null;
    if (req.isUserLoggedIn && req.user && req.user.fullname) {
      firstname = req.user.fullname.split(' ')[0]; // Extract the first name from the full name
    }
  res.render('data', {
    courseID, isUserLoggedIn: req.isUserLoggedIn,
    username: username, pageTitle,
    metaRobots,
    metaKeywords,
    ogDescription,
    canonicalLink, isBlogPage: false,
    firstname:firstname
  });
});



app.post('/upload-documents', upload.fields([
  { name: 'officialIDCard' },
  { name: 'medicalCertificate' },
  { name: 'mciCertificate' },
  { name: 'degree' },
  { name: 'passportPhoto' }
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
    if (req.files.officialIDCard) uploadedFiles.push({ ...req.files.officialIDCard[0], title: 'Official ID Card' });
    if (req.files.medicalCertificate) uploadedFiles.push({ ...req.files.medicalCertificate[0], title: 'Medical Certificate' });
    if (req.files.mciCertificate) uploadedFiles.push({ ...req.files.mciCertificate[0], title: 'MCI Certificate' });
    if (req.files.degree) uploadedFiles.push({ ...req.files.degree[0], title: 'Degree Certificate' });
    if (req.files.passportPhoto) uploadedFiles.push({ ...req.files.passportPhoto[0], title: 'Passport Size Photo' });
  

    const userUpdate = {
      $push: { uploadedFiles: { $each: uploadedFiles } },
      mciNumber: req.body.mciNumber,
      address: req.body.address,
      idNumber: req.body.idNumber,
    };
    // Find the user by ID and update the uploadedFiles array
    const user = await User.findByIdAndUpdate(userId, userUpdate, { new: true });

    if (!user) {
      console.error('User not found:', userId);
      return res.status(404).send('User not found');
    }

    // Send an email to the user after successfully uploading documents
    const userEmail = user.username; // Assuming the email is stored as username in the database
    const emailSubject = 'Thank You for Uploading Documents';
    const emailText = `Dear Dr. ${user.fullname || 'User'},\n\nThank you for uploading your documents. We will enroll you in the Moodle course within 24 hours after verifying the documents you have submitted.\n\nBest Regards,\nGlobal Med Academy`;

    sendEmail({
      to: userEmail,
      subject: emailSubject,
      text: emailText
    });

    // Redirect the user to the /user route after uploading the documents
    res.redirect('/user');
  } catch (error) {
    console.error('Error in upload route:', error);
    res.status(500).send('Internal Server Error');
  }
});
const updateMoodlePassword = async (email, newPassword) => {
  const moodleUrl = 'https://moodle.upskill.globalmedacademy.com'; // Replace with your Moodle URL
  const token = process.env.MOODLE_TOKEN; // Replace with your actual token
  const functionname = 'core_user_update_users';

  // Retrieve Moodle user ID using the function we've just implemented
  const moodleUserId = await getMoodleUserId(email);

  const users = [{
    id: moodleUserId,
    password: newPassword
  }];

  const postData = {
    wstoken: token,
    wsfunction: functionname,
    moodlewsrestformat: 'json',
    users: users
  };

  try {
    const response = await axios.post(`${moodleUrl}/webservice/rest/server.php`, null, {
      params: postData
    });

    // Moodle usually returns an empty object on success for update functions
    return response.data; // Handle the response data as needed
  } catch (error) {
    console.error('Failed to update password in Moodle:', error);
    // Handle the error accordingly
    throw error; // It's good practice to rethrow the error if you cannot handle it properly here
  }
};


const getMoodleUserId = async (email) => {
  const moodleUrl = 'https://moodle.upskill.globalmedacademy.com'; // Replace with your Moodle URL
  const token = process.env.MOODLE_TOKEN; // Replace with your actual token
  const functionname = 'core_user_get_users_by_field';

  try {
    const response = await axios.post(`${moodleUrl}/webservice/rest/server.php`, null, {
      params: {
        wstoken: token,
        wsfunction: functionname,
        moodlewsrestformat: 'json',
        field: 'email',
        values: [email]
      }
    });

    const users = response.data;
    if (users.length === 0) {
      throw new Error('No Moodle user found with the given email address.');
    }

    return users[0].id;
  } catch (error) {
    console.error('Failed to retrieve Moodle user ID:', error);
    throw error;
  }
};



app.listen(3000, function () {
  console.log("Server started successfully!");
});
setRoutes(app);
