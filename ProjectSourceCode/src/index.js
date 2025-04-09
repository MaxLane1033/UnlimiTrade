// ----------------------------------   DEPENDENCIES  ----------------------------------------------
const express = require('express');
const app = express();
const handlebars = require('express-handlebars');
const path = require('path');
const pgp = require('pg-promise')();
const bodyParser = require('body-parser');
const session = require('express-session');

// -------------------------------------  APP CONFIG   ----------------------------------------------

// create `ExpressHandlebars` instance and configure the layouts and partials dir.
const hbs = handlebars.create({
  extname: 'hbs',
  layoutsDir: __dirname + '/views/layouts',
  partialsDir: __dirname + '/views/partials',
});

// Register `hbs` as our view engine using its bound `engine()` function.
app.engine('hbs', exphbs.engine({ extname: 'hbs', defaultLayout: 'main', layoutsDir: path.join(__dirname, 'src/views') }));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'src/views'));

app.use(bodyParser.json());
// set Session
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    saveUninitialized: true,
    resave: true,
  })
);
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

// -------------------------------------  DB CONFIG AND CONNECT   ---------------------------------------
const dbConfig = {
  host: 'db',
  port: 5432,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
};
const db = pgp(dbConfig);

// db test
db.connect()
  .then(obj => {
    // Can check the server version here (pg-promise v10.1.0+):
    console.log('Database connection successful');
    obj.done(); // success, release the connection;
  })
  .catch(error => {
    console.log('ERROR', error.message || error);
  });

// -------------------------------------  ROUTES for login.hbs   ----------------------------------------------
const Users = {
  user_id : undefined,
  username : undefined,
  email : undefined,
  password_hash,
};

 // -------------------------------------  ROUTES (Public)   ----------------------------------------------

// If someone hits "/", redirect to /register
app.get('/', (req, res) => {
  res.redirect('/register');
});

// Show login form
app.get('/login', (req, res) => {
  res.render('pages/login');
});

// Show register form
app.get('/register', (req, res) => {
  res.render('pages/register');
});

// Process registration form (POST)
app.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const passwordHash = password;

    await db.none(
      `INSERT INTO Users (username, email, password_hash)
       VALUES ($1, $2, $3)`,
      [username, email, passwordHash]
    );

    res.redirect('/login');
  } catch (err) {
    console.error('Register error:', err);
    // You can render the same page with an error message if desired:
    res.render('pages/register', {
      error: true,
      message: err.message,
    });
  }
});

// -------------------------------------  Login Submission -----------------------------------------------
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const query = `SELECT * FROM Users WHERE email = $1 LIMIT 1`;
  const values = [email];

  db.one(query, values)
    .then(data => {
      // Example password check (plaintext for demonstration only!)
      if (data.password_hash !== password) {
        throw new Error('Invalid email/password');
      }

      // Store user in session
      req.session.user = {
        user_id: data.user_id,
        username: data.username,
        email: data.email,
        password: data.password_hash, // or omit if you like
        student_id: data.student_id   // if your table has it
      };

      req.session.save(() => {
        // Redirect to home page or wherever you like
        res.redirect('/home');
      });
    })
    .catch(err => {
      console.error('Login error:', err);
      res.render('pages/login', {
        error: true,
        message: err.message,
      });
    });
});

// Middleware to protect certain routes
const auth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
};

// -------------------------------------  Protected Routes  ----------------------------------------------
app.use(auth);

// -------------------------------------  ROUTES for home.hbs   ----------------------------------------------

app.get('/home', (req, res) => {
  res.render('pages/home', {
    username: req.session.user.username,
    first_name: req.session.user.first_name,
    last_name: req.session.user.last_name,
    email: req.session.user.email,
    year: req.session.user.year,
    major: req.session.user.major,
    degree: req.session.user.degree,
  });
});


// -------------------------------------  ROUTES for courses.hbs   ----------------------------------------------

app.get('/courses', (req, res) => {
  const taken = req.query.taken;
  // Query to list all the courses taken by a student

  db.any(taken ? student_courses : all_courses, [req.session.user.student_id])
    .then(courses => {
      console.log(courses)
      res.render('pages/courses', {
        email: user.email,
        courses,
        action: req.query.taken ? 'delete' : 'add',
      });
    })
    .catch(err => {
      res.render('pages/courses', {
        courses: [],
        email: user.email,
        error: true,
        message: err.message,
      });
    });
});

app.post('/courses/add', (req, res) => {
  const course_id = parseInt(req.body.course_id);
  db.tx(async t => {
    // This transaction will continue iff the student has satisfied all the
    // required prerequisites.
    const {num_prerequisites} = await t.one(
      `SELECT
        num_prerequisites
       FROM
        course_prerequisite_count
       WHERE
        course_id = $1`,
      [course_id]
    );

    if (num_prerequisites > 0) {
      // This returns [] if the student has not taken any prerequisites for
      // the course.
      const [row] = await t.any(
        `SELECT
              num_prerequisites_satisfied
            FROM
              student_prerequisite_count
            WHERE
              course_id = $1
              AND student_id = $2`,
        [course_id, req.session.user.student_id]
      );

      if (!row || row.num_prerequisites_satisfied < num_prerequisites) {
        throw new Error(`Prerequisites not satisfied for course ${course_id}`);
      }
    }

    // There are either no prerequisites, or all have been taken.
    await t.none(
      'INSERT INTO student_courses(course_id, student_id) VALUES ($1, $2);',
      [course_id, req.session.user.student_id]
    );
   
    return t.any(all_courses, [req.session.user.student_id]);
  })
    .then(courses => {
      //console.info(courses);
      res.render('pages/courses', {
        email: user.email,
        courses,
        message: `Successfully added course ${req.body.course_id}`,
      });
    })
    .catch(err => {
      res.render('pages/courses', {
        email: user.email,
        courses: [],
        error: true,
        message: err.message,
      });
    });
});

app.get('/my_courses', (req, res) => {
  const taken = req.query.taken;
  // Query to list all the courses taken by a student

  db.any(taken ? student_courses : all_courses, [req.session.user.student_id])
    .then(courses => {
      console.log(courses)
      res.render('pages/my_courses', {
        email: user.email,
        courses,
        action: req.query.taken ? 'delete' : 'add',
      });
    })
    .catch(err => {
      res.render('pages/my_courses', {
        courses: [],
        email: user.email,
        error: true,
        message: err.message,
      });
    });
});

// -------------------------------------  ROUTES for logout.hbs   ----------------------------------------------

app.get('/logout', (req, res) => {
  req.session.destroy(function(err) {
    res.render('pages/logout');
  });
});


// -------------------------------------  ROUTES for courses.hbs   ----------------------------------------------
app.get('/profile', (req, res) => {
  res.render('pages/profile', {
    layout: 'main',
    pageTitle: 'Profile'
  });
});


// -------------------------------------  START THE SERVER   ----------------------------------------------

app.listen(3000);
console.log('Server is listening on port 3000');


// -------------------------- Code for home page DO NOT DELETE
