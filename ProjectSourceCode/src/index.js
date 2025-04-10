// ----------------------------------   DEPENDENCIES  ----------------------------------------------
const express = require('express');
const app = express();
const handlebars = require('express-handlebars');
const path = require('path');
const pgp = require('pg-promise')();
const bodyParser = require('body-parser');
const session = require('express-session');

// -------------------------------------  APP CONFIG   ----------------------------------------------

// Create an ExpressHandlebars instance with desired settings.
const hbs = handlebars.create({
  extname: 'hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views', 'layouts'),
  partialsDir: path.join(__dirname, 'views', 'partials'),
});

// Register 'hbs' as our view engine by simply passing the engine callback.
app.engine('hbs', hbs.engine);
app.set('view engine', 'hbs');
// Set your views directory – adjust if needed.
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

// Set up session
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'mysecret', // provide a default for development
    saveUninitialized: true,
    resave: true,
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

// Test DB connection
db.connect()
  .then(obj => {
    console.log('Database connection successful');
    obj.done();
  })
  .catch(error => {
    console.log('ERROR', error.message || error);
  });

// -------------------------------------  ROUTES for login.hbs   ----------------------------------------------

// Define Users object with password_hash initialized as undefined.
const Users = {
  user_id: undefined,
  username: undefined,
  email: undefined,
  password_hash: undefined,
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
  console.log("BODY: ",req.body);
  try {
    const { username, password } = req.body;    
    // For demonstration purposes; in production hash the password (e.g., using bcrypt)
    const passwordHash = password;

    await db.any(
      `INSERT INTO Users (username, password_hash)
       VALUES ($1, $2)`,
      [username, passwordHash]
    );

    res.redirect('/login');
  } catch (err) {
    console.error('Register error:', err);
    res.render('pages/register', {
      error: true,
      message: err.message,
    });
  }
});

// -------------------------------------  Login Submission -----------------------------------------------
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const query = `SELECT * FROM Users WHERE username = $1 LIMIT 1`;
  const values = [username];

  db.one(query, values)
    .then(data => {
      // Example password check (plaintext; use proper hashing in production!)
      if (data.password_hash !== password) {
        throw new Error('Invalid email/password');
      }

      // Store user info in the session
      req.session.user = {
        user_id: data.user_id,
        username: data.username,
        // email: data.email,
        password: data.password_hash,
      };

      req.session.save(() => {
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
    username: req.session.user.username
  });
});

// -------------------------------------  ROUTES for courses.hbs   ----------------------------------------------

// You must define "all_courses" and "student_courses" queries (adjust as needed)
const all_courses = `
  SELECT course_id, course_name FROM courses ORDER BY course_id;
`;
const student_courses = `
  SELECT c.course_id, c.course_name
    FROM student_courses sc
    JOIN courses c ON sc.course_id = c.course_id
   WHERE sc.student_id = $1;
`;

app.get('/courses', (req, res) => {
  const taken = req.query.taken;
  db.any(taken ? student_courses : all_courses, [req.session.user.student_id])
    .then(courses => {
      res.render('pages/courses', {
        email: req.session.user.email,
        courses,
        action: req.query.taken ? 'delete' : 'add',
      });
    })
    .catch(err => {
      res.render('pages/courses', {
        courses: [],
        email: req.session.user.email,
        error: true,
        message: err.message,
      });
    });
});

app.post('/courses/add', (req, res) => {
  const course_id = parseInt(req.body.course_id);
  db.tx(async t => {
    // Check prerequisites
    const { num_prerequisites } = await t.one(
      `SELECT num_prerequisites
         FROM course_prerequisite_count
        WHERE course_id = $1`,
      [course_id]
    );

    if (num_prerequisites > 0) {
      const [row] = await t.any(
        `SELECT num_prerequisites_satisfied
           FROM student_prerequisite_count
          WHERE course_id = $1
            AND student_id = $2`,
        [course_id, req.session.user.student_id]
      );

      if (!row || row.num_prerequisites_satisfied < num_prerequisites) {
        throw new Error(`Prerequisites not satisfied for course ${course_id}`);
      }
    }

    // Insert into student_courses
    await t.none(
      'INSERT INTO student_courses(course_id, student_id) VALUES ($1, $2);',
      [course_id, req.session.user.student_id]
    );
   
    return t.any(all_courses, [req.session.user.student_id]);
  })
    .then(courses => {
      res.render('pages/courses', {
        email: req.session.user.email,
        courses,
        message: `Successfully added course ${req.body.course_id}`,
      });
    })
    .catch(err => {
      res.render('pages/courses', {
        email: req.session.user.email,
        courses: [],
        error: true,
        message: err.message,
      });
    });
});

app.get('/my_courses', (req, res) => {
  const taken = req.query.taken;
  db.any(taken ? student_courses : all_courses, [req.session.user.student_id])
    .then(courses => {
      res.render('pages/my_courses', {
        email: req.session.user.email,
        courses,
        action: req.query.taken ? 'delete' : 'add',
      });
    })
    .catch(err => {
      res.render('pages/my_courses', {
        courses: [],
        email: req.session.user.email,
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


//--------------------------------------Route for post.hbs
app.get('/post', (req, res) => {
  res.render('pages/post');
});
app.post('/post', (req, res) => {
  const { item, description} = req.body;
  // Normally, you'd save the new item to a database here.
  console.log('Item Posted:', {item, description });

  // For now, just send a success message back
  res.send('Item Posted Successfully!');
});
// -------------------------------------  ROUTES for profile.hbs   ----------------------------------------------
app.get('/profile', (req, res) => {
  res.render('pages/profile', {
    layout: 'main',
    pageTitle: 'Profile',
  });
});

// -------------------------------------  ROUTES for browse.hbs   ----------------------------------------------
app.get('/browse', (req, res) => {
  res.render('pages/browse', {
    layout: 'main',
    pageTitle: 'Browse',
  });
});
// -------------------------------------  START THE SERVER   ----------------------------------------------
app.listen(3000, () => {
  console.log('Server is listening on port 3000');
});
