// *****************************************************
// <!-- Section 1 : Import Dependencies -->
// *****************************************************

const express = require('express'); // To build an application server or API
const app = express();
const handlebars = require('express-handlebars');
const Handlebars = require('handlebars');
const path = require('path');
const pgp = require('pg-promise')(); // To connect to the Postgres DB from the node server
const bodyParser = require('body-parser');
const session = require('express-session'); // To set the session object. To store or access session data, use the `req.session`, which is (generally) serialized as JSON by the store.
const bcrypt = require('bcryptjs'); //  To hash passwords
const axios = require('axios'); // To make HTTP requests from our server. We'll learn more about it in Part C.

// *****************************************************
// <!-- Section 2 : Connect to DB -->
// *****************************************************

// create `ExpressHandlebars` instance and configure the layouts and partials dir.
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: __dirname + '/src/views/layouts',
  partialsDir: __dirname + '/src/views/partials',
});

// database configuration
const dbConfig = {
  host: 'db', // the database server
  port: 5432, // the database port
  database: process.env.POSTGRES_DB, // the database name
  user: process.env.POSTGRES_USER, // the user account to connect with
  password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const db = pgp(dbConfig);

// test your database
db.connect()
  .then(obj => {
    console.log('Database connection successful'); // you can view this message in the docker compose logs
    obj.done(); // success, release the connection;
  })
  .catch(error => {
    console.log('ERROR:', error.message || error);
  });

// *****************************************************
// <!-- Section 3 : App Settings -->
// *****************************************************

// Register `hbs` as our view engine using its bound `engine()` function.
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.json()); 

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    saveUninitialized: false,
    resave: false,
  })
);

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

// *****************************************************
// <!-- Section 4 : API Routes -->
// *****************************************************

// TODO - Include your API routes here

//API route for register
app.get('/', (req, res) => {
    res.redirect('/register'); 
  });
  
  app.get('/register', (req, res) => {
    res.render('pages/register')
  });

  app.get('/login', (req, res) => {
    res.render('pages/login'); 
});




app.post('/login', async (req, res) => {
    const { username, password } = req.body;
  
    try {
    const user = await db.oneOrNone('SELECT * FROM users WHERE username = $1', [username]);
  
    if (!user) {
        return res.redirect('/register');
    }
  
    const match = await bcrypt.compare(password, user.password);
  
    if (!match) {
        console.log("FIALED 99");
        return res.render('login', { error: 'Incorrect username or password.' }); 
    }
  
    req.session.user = { id: user.id, username: user.username };
    req.session.save(() => {
        res.redirect('/discover'); 
    });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).send('Internal Server Error');
    }
});
  

app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const insertQuery = `
      INSERT INTO users (username, password)
      VALUES ($1, $2)
    `;
    await db.none(insertQuery, [username, hashedPassword]);

    res.redirect('/login');
  } catch (err) {
    console.error('Error during registration:', err);
    res.redirect('/register');
  }
});

app.get('/logout', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login'); 
    }
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Failed to log out');
        }
        res.render('pages/logout');
    });
});


// Authentication Middleware.
const auth = (req, res, next) => {
    if (!req.session.user) {
      // Default to login page.
      return res.redirect('/login');
    }
    next();
  };
  
  // Authentication Required
app.use(auth);


  

// *****************************************************
// <!-- Section 5 : Start Server-->
// *****************************************************
// starting the server and keeping the connection open to listen for more requests
app.listen(3000);
console.log('Server is listening on port 3000');