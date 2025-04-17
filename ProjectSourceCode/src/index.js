// ----------------------------------   DEPENDENCIES  ----------------------------------------------
const express = require('express');
const app = express();

const handlebars = require('express-handlebars');
const path = require('path');
const pgp = require('pg-promise')();
const bodyParser = require('body-parser');
const session = require('express-session');

// this is for the profile.hbs to allow a picture to be uploaded
const multer = require('multer');
const upload = multer({ dest: 'public/uploads/' }); // You can customize this folder


app.use(express.static(path.join(__dirname, 'public'))); //for profile picture 



// -------------------------------------  APP CONFIG   ----------------------------------------------

// Create an ExpressHandlebars instance with desired settings.
const hbs = handlebars.create({
  extname: 'hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views', 'layouts'),
  partialsDir: path.join(__dirname, 'views', 'partials'),
});

// Register custom Handlebars helper
hbs.handlebars.registerHelper('ifEquals', function (arg1, arg2, options) {
  return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
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
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
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
  console.log("hello test");
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
      if (data.password_hash !== password) {
        throw new Error('Invalid username/password');
      }

      // Store full user info, including profile picture
      req.session.user = {
        user_id: data.user_id,
        username: data.username,
        password: data.password_hash,
        profile_picture: data.profile_picture || null
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


app.post('/post', upload.single('itemImage'), async (req, res) => {
  const { itemName, tradeDetails } = req.body;
  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  // Validate required fields 
  // NEED TO FIND OUT WHY WHEN THERE IS NO IMAGE, IT JUST RELOADS THE PAGE WITH NO MESSAGE
  if (!itemName || !tradeDetails || !imagePath) {
    return res.render('pages/post', {
      error: true,
      message: 'All fields are required: item name, description, and image.'
    });
  }

  try {
    await db.none(
      `INSERT INTO Items (user_id, name, description, status, image_path)
       VALUES ($1, $2, $3, 'available', $4)`,
      [req.session.user.user_id, itemName, tradeDetails, imagePath]
    );

    res.redirect('/browse');
  } catch (err) {
    console.error(err);
    res.render('pages/post', { error: true, message: err.message });
  }
});

// -------------------------------------  ROUTES for profile.hbs   ----------------------------------------------
app.get('/profile', async (req, res) => {
  try {
    const userId = req.session.user.user_id;

    const tradeHistory = await db.any(
      `SELECT name AS itemName, status, '' AS otherUser
       FROM Items
       WHERE user_id = $1`,
      [userId]
    );

    const postedItems = await db.any(
      `SELECT item_id, name, description, image_path
       FROM Items
       WHERE user_id = $1 AND image_path IS NOT NULL`,
      [req.session.user.user_id]
    );
    

    res.render('pages/profile', {
      layout: 'main',
      pageTitle: 'Profile',
      username: req.session.user.username,
      profile_picture: req.session.user.profile_picture || null,
      tradeHistory,
      postedItems
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.render('pages/profile', {
      error: true,
      message: 'Could not load profile',
    });
  }
});

// -------------------------------------  Deleting post on profile pic   ----------------------------------------------

app.post('/delete-item/:itemId', async (req, res) => {
  const itemId = req.params.itemId;
  const userId = req.session.user.user_id;

  try {
    // Ensure the item belongs to the logged-in user
    await db.none(`DELETE FROM Items WHERE item_id = $1 AND user_id = $2`, [itemId, userId]);
    res.redirect('/profile');
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).send('Error deleting item');
  }
});



// -------------------------------------  Route to render edit-profile page  ----------------------------------------------
app.get('/edit-profile', (req, res) => {
  res.render('pages/edit-profile', {
    layout: 'main',
    username: req.session.user.username,
    profile_picture: req.session.user.profile_picture || null
  });
});

// -------------------------------------  ROUTES for browse.hbs   ----------------------------------------------
app.get('/browse', (req, res) => {
  res.render('pages/browse', {
    layout: 'main',
    pageTitle: 'Browse',
  });
});


// -------------------------------------  ROUTES for editing profile info ----------------------------------------------
app.post('/edit-profile', upload.single('profile_picture'), async (req, res) => {
  const username = req.body.username;
  const profilePic = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    await db.none(
      `UPDATE Users SET username = $1, profile_picture = COALESCE($2, profile_picture) WHERE user_id = $3`,
      [username, profilePic, req.session.user.user_id]
    );

    // Update session info
    req.session.user.username = username;
    if (profilePic) req.session.user.profile_picture = profilePic;

    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    res.render('pages/edit-profile', { error: true, message: err.message });
  }
});
app.get('/about', async (req, res) => {
  res.render('pages/about');
})
app.get('/terms', async (req, res) => {
  res.render('pages/terms');
})
app.get('/privacy', async (req, res) => {
  res.render('pages/privacy');
})

app.get('/myTrades', async (req, res) => {
  const userId = req.session.user.user_id;

  try {
    const trades = await db.any(`
      SELECT 
        trades.id,
        trades.message,
        trades.status,
        sender.username AS sender_username,
        receiver.username AS receiver_username,
        offered_item.name AS offered_item_name,
        offered_item.image_url AS offered_item_image,
        requested_item.name AS requested_item_name,
        requested_item.image_url AS requested_item_image
      FROM trades
      JOIN users AS sender ON trades.sender_id = sender.user_id
      JOIN users AS receiver ON trades.receiver_id = receiver.user_id
      JOIN items AS offered_item ON trades.offered_item_id = offered_item.item_id
      JOIN items AS requested_item ON trades.requested_item_id = requested_item.item_id
      WHERE trades.sender_id = $1 OR trades.receiver_id = $1
      ORDER BY trades.created_at DESC;
    `, [userId]);

    res.render('pages/myTrades', { trades });
  } catch (err) {
    console.error('Error fetching trades:', err);
    res.render('pages/myTrades', { trades: [], error: 'Failed to load trades.' });
  }
});



// -------------------------------------  START THE SERVER   ----------------------------------------------
app.listen(3000, () => {
  console.log('Server is listening on port 3000');
});
