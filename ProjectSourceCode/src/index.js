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


// comment out the above and uncomment this to test it locally 
// const dbConfig = {
//   host: process.env.POSTGRES_HOST || 'db',   
//   port: process.env.POSTGRES_PORT || 5432,
//   database: process.env.POSTGRES_DB || 'your_db_name',
//   user: process.env.POSTGRES_USER || 'your_db_user',
//   password: process.env.POSTGRES_PASSWORD || 'your_db_password',
// };


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

// Show register form below
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
 
  const { itemName, tradeDetails, category } = req.body;

  const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!itemName || !tradeDetails || !category || !imagePath) {
    return res.render('pages/post', {
      error  : true,
      message: 'All fields are required: item name, description, category, and image.'
    });
  }

  try {
    await db.none(
      `INSERT INTO Items (user_id, name, description, category, status, image_path)
       VALUES ($1, $2, $3, $4, 'available', $5)`,
      [req.session.user.user_id, itemName, tradeDetails, category, imagePath]
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

    const tradeHistory = await db.any(`
      SELECT 
        t.status,
        -- Show both item names clearly
        offered.name AS offered_item_name,
        requested.name AS requested_item_name,
        -- Decide who the other user is
        CASE 
          WHEN t.sender_id = $1 THEN u_receiver.username
          ELSE u_sender.username
        END AS otherUser
      FROM trades t
      JOIN users u_sender ON t.sender_id = u_sender.user_id
      JOIN users u_receiver ON t.receiver_id = u_receiver.user_id
      JOIN items offered ON t.offered_item_id = offered.item_id
      JOIN items requested ON t.requested_item_id = requested.item_id
      WHERE (t.sender_id = $1 OR t.receiver_id = $1)
        AND t.status = 'accepted'
      ORDER BY t.created_at DESC;
    `, [userId]);
    
    
    const postedItems = await db.any(
      `SELECT item_id, name, description, category, image_path
        FROM Items
        WHERE user_id = $1 AND image_path IS NOT NULL AND status != 'traded'`,
      [userId]
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
app.get('/browse', async (req, res) => {
  try {
    // Exclude the logged-in user's own items
    const items = await db.any(`
      SELECT item_id, name, description, category, status, image_path, user_id
      FROM Items
      WHERE status = 'available'
        AND image_path IS NOT NULL
        AND user_id != $1
      ORDER BY item_id DESC
    `, [req.session.user.user_id]);

    console.log('[Browse] fetched rows:', items.length); // quick sanity check

    res.render('pages/browse', {
      layout: 'main',
      pageTitle: 'Browse',
      items,
      currentUserId: req.session.user.user_id // Optional: useful for frontend conditionals
    });
  } catch (err) {
    console.error('[Browse] DB error:', err);
    res.status(500).render('pages/browse', {
      layout: 'main',
      pageTitle: 'Browse',
      items: [],
      hasError: true,
      errMsg: 'Server error: ' + err.message
    });
  }
});




// -------------------------------------  ROUTE to propose a trade (GET) ----------------------------------------------
app.get('/trade/:itemId', async (req, res) => {
  const userId = req.session.user.user_id;
  const requestedItemId = req.params.itemId;

  try {
    const requestedItem = await db.one(
      `SELECT item_id, name, description, image_path, user_id
       FROM Items
       WHERE item_id = $1`,
      [requestedItemId]
    );

    // Prevent user from trading on their own item
    if (requestedItem.user_id === userId) {
      return res.redirect('/browse');
    }

    const userItems = await db.any(
      `SELECT item_id, name, image_path
       FROM Items
       WHERE user_id = $1 AND status = 'available'`,
      [userId]
    );

    res.render('pages/initiateTrade', {
      requestedItem,
      userItems
    });
  } catch (err) {
    console.error('Trade page error:', err);
    res.redirect('/browse');
  }
});


// -------------------------------------  ROUTE to submit a trade request (POST) ----------------------------------------------
app.post('/trade', async (req, res) => {
  const senderId = req.session.user.user_id;
  const { offeredItemId, requestedItemId, message } = req.body;

  try {
    await db.tx(async t => {
      // Insert trade
      await t.none(`
        INSERT INTO trades (sender_id, receiver_id, offered_item_id, requested_item_id, message, status, created_at)
        VALUES (
          $1,
          (SELECT user_id FROM Items WHERE item_id = $2),
          $3,
          $2,
          $4,
          'pending',
          NOW()
        )
      `, [senderId, requestedItemId, offeredItemId, message]);

      // Mark both items as pending
      await t.none(
        `UPDATE Items SET status = 'pending' WHERE item_id IN ($1, $2)`,
        [offeredItemId, requestedItemId]
      );
    });

    res.redirect('/myTrades');
  } catch (err) {
    console.error('Trade submission error:', err);
    res.redirect('/browse');
  }
});

// -------------------------------------  ROUTES to Accept or Deny a Trade  ----------------------------------------------

app.post('/trade/:id/accept', async (req, res) => {
  const tradeId = req.params.id;

  try {
    await db.tx(async t => {
      await t.none(`UPDATE trades SET status = 'accepted' WHERE id = $1`, [tradeId]);

      // Also update item statuses
      await t.none(`
        UPDATE Items SET status = 'traded'
        WHERE item_id IN (
          SELECT offered_item_id FROM trades WHERE id = $1
          UNION
          SELECT requested_item_id FROM trades WHERE id = $1
        )`, [tradeId]);
    });

    req.session.message = { type: 'success', text: 'Trade accepted!' };
    res.redirect('/myTrades');
  } catch (err) {
    console.error('Accept trade error:', err);
    req.session.message = { type: 'error', text: 'Failed to accept trade.' };
    res.redirect('/myTrades');
  }
});

app.post('/trade/:id/deny', async (req, res) => {
  const tradeId = req.params.id;

  try {
    await db.tx(async t => {
      await t.none(`UPDATE trades SET status = 'denied' WHERE id = $1`, [tradeId]);

      // Revert item statuses back to available
      await t.none(`
        UPDATE Items SET status = 'available'
        WHERE item_id IN (
          SELECT offered_item_id FROM trades WHERE id = $1
          UNION
          SELECT requested_item_id FROM trades WHERE id = $1
        )`, [tradeId]);
    });

    req.session.message = { type: 'success', text: 'Trade denied.' };
    res.redirect('/myTrades');
  } catch (err) {
    console.error('Deny trade error:', err);
    req.session.message = { type: 'error', text: 'Failed to deny trade.' };
    res.redirect('/myTrades');
  }
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
        trades.sender_id,
        trades.receiver_id,
        sender.username AS sender_username,
        receiver.username AS receiver_username,
        offered_item.name AS offered_item_name,
        offered_item.image_path AS offered_item_image,
        requested_item.name AS requested_item_name,
        requested_item.image_path AS requested_item_image
      FROM trades
      JOIN users AS sender ON trades.sender_id = sender.user_id
      JOIN users AS receiver ON trades.receiver_id = receiver.user_id
      JOIN items AS offered_item ON trades.offered_item_id = offered_item.item_id
      JOIN items AS requested_item ON trades.requested_item_id = requested_item.item_id
      WHERE (trades.sender_id = $1 OR trades.receiver_id = $1)
        AND trades.status = 'pending'
      ORDER BY trades.created_at DESC;
    `, [userId]);
        

    const message = req.session.message;

  res.render('pages/myTrades', {
    trades,
    message: message || null,
    userId: req.session.user.user_id
  });

delete req.session.message; // Delete it after rendering


  } catch (err) {
    console.error('Error fetching trades:', err);
    res.render('pages/myTrades', { trades: [], error: 'Failed to load trades.' });
  }
});




// -------------------------------------  START THE SERVER   ----------------------------------------------
app.listen(3000, () => {
  console.log('Server is listening on port 3000');
});
