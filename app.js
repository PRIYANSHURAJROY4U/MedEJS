require('dotenv').config();
const express=require("express");
const bodyParser=require("body-parser");
const path=require("path");

const ejs = require("ejs");
const passportlocalmongoose = require("passport-local-mongoose");
const passport = require("passport");
const session = require("express-session");
const mongoose = require("mongoose");
// const nodemailer = require('nodemailer');r
const mongodb = require("mongodb");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');
let loggedIn=true;

const app=express();

app.set('view engine','ejs');
app.use(bodyParser.urlencoded({extended:true}));
app.use('/assets', express.static(path.join(__dirname, 'assets')));




app.use(session({
  secret: "global med academy is way to success",
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(`${process.env.DB_URL}`);

// google stratrgy starts



//  (rrp)


const UserSchema = new mongoose.Schema ({
  name: String,
  username: String,
  passwword: String,
  googleId: String
});

UserSchema.plugin(passportlocalmongoose);
UserSchema.plugin(findOrCreate);
const User = mongoose.model("User" , UserSchema);

passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,

 
  callbackURL: "https://globalmedacademy.com/auth/google/test",

  userProfileURL: "https://www.googleapis.com/oauth2/v2/userinfo"
},
function(accessToken, refreshToken, profile, cb) {
  User.findOrCreate({ googleId: profile.id }, function (err, user) {
    return cb(err, user);
  });
}
));

passport.use(User.createStrategy());


passport.serializeUser(function(user, done) {
    done(null, user.id);

});


passport.deserializeUser(function(id, done) {
    // User.findById(id, function(err, user) {
    //     done(err, user);
    // });

    User.findById(id)
     .then( user => {
      done(null ,user);
     })

     .catch(err => {
      done(err , null);
     })
});

app.get("/",function(req,res){
  res.render("index");
});


app.get("/data", (req,res) => {
  res.render("data");
})

app.get("/auth/google",
  passport.authenticate('google', {
    scope: ['profile', 'email']
  })
);

app.get("/auth/google/test",
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/test');
  });

  

app.get("/login",function(req,res){
    res.render("login");
});

app.get("/login",function(req,res){
  res.render("login");
});


app.post("/register",(req,res) => {

    User.register({username:req.body.username,name:req.body.name},req.body.password,function(err,user){
      if(err)
      {
        console.log(err);
        
      } else
      {
        passport.authenticate("local")(req,res,function(){
          res.redirect("/test");
        })
      }
    })
  
  });

  app.post("/login",function(req,res){

    const user = new User ({
      username:req.body.username,
      password:req.body.password,
      name : req.body.name
    })
  
      req.login(user,function(err){
        if (err) {
          console.log(err);
        } else {
          passport.authenticate("local")(req,res,function(){
            res.redirect("/test");
          });
        }
      });
  
       
  });
  app.post("/register",function(req,res){

    const user = new User ({
      username:req.body.username,
      password:req.body.password,
      name : req.body.name
    })
  
      req.login(user,function(err){
        if (err) {
          console.log(err);
        } else {
          passport.authenticate("local")(req,res,function(){
            res.redirect("/test");
          });
        }
      });
  
       
  });
  app.post("/login", (req,res) => {

    const name = req.body.name;
     
    req.session.name = name;
   
    res.redirect("/test");
  });
  app.post("/register", (req,res) => {

    const username = req.body.name;
     
    req.session.username = username;
   
  });
  app.get("/test", (req,res) => {

    const name = req.session.name;
    console.log(name);
    res.render("auth_index", { name: name});

  });
// const checkAuthentication=(req,res,next)=>{
//   if(req.isAuthenticated()){
//     res.locals.isLoggedIn=true;
//   }
//   else{
//     res.locals.isLoggedIn=false;
//   }
//   next();
// }
// app.use(checkAuthentication);
app.listen(3000,function(){
    console.log("Server started on 3000");
});
app.get("/course-masonry",function(req,res){
  if (req.user) {
    loggedIn=true;
    res.render('course-masonry', { loggedIn });
}
else{
  loggedIn=false;
  res.render('course-masonry',{ loggedIn })
}
});
app.get("/course-details",function(req,res){
  if (req.user) {
    loggedIn=true;
    res.render('course-details', { loggedIn:loggedIn });
} else {
  loggedIn=false;
  res.render('course-details',{ loggedIn })
}
});
app.get("/auth_index",function(req,res){
  res.render("auth_index");N
});
app.get("/becometeacher",function(req,res){
  res.render("becometeacher");
});
app.get("/privacy-policy",function(req,res){
  res.render("privacy-policy");
});
app.get("/admission-guide",function(req,res){
  res.render("admission-guide");
});
app.get("/course-details-fellowshipininternalmedicine",(req,res)=>{
  res.render("course-details-fellowshipininternalmedicine");
})
app.get("/course-details-fellowshipincriticalcare",(req,res)=>{
  res.render("course-details-fellowshipincriticalcare");
});
app.get("/course-details-obsgynae",(req,res)=>{
  res.render("course-details-obsgynae");
});