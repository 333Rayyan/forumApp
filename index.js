const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');

const app = express();
const port = 8000;

const session = require('express-session');

app.use(session({
	secret: '1111',
	resave: true,
	saveUninitialized: true
}));


const db = mysql.createConnection({
	host: 'localhost',
	user: 'app',
	password: 'forumApp1',
	database: 'forumApp'
});

db.connect(err => {
	if (err) {
		console.error('Error connecting to database:');
		return;
	}
	console.log('Connected to database');
});


app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));

app.use(express.static(__dirname + '/public'));

const isAuthenticated = (req, res, next) => {
	if (req.user) {
		return next();
	} else {
		res.redirect('./login');
	}
};

// Middleware to populate req.user and res.locals.loggedInUser from the session
app.use((req, res, next) => {
	if (req.session.user) {
		req.user = req.session.user;
	}
	else {
		req.user = null;
	}
	next();
});

// home route
app.get('/', (req, res) => {
	res.render('home', { loggedInUser: req.user });
});

// about route
app.get('/about', (req, res) => {
	const loggedInUser = req.user;

	res.render('about', { loggedInUser });
});

// register route
app.get('/register', (req, res) => {
	res.render('register');
});

app.post('/register', (req, res) => {
	const { username, password } = req.body;

	db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], (err, result) => {
		if (err) throw err;
		res.redirect('./');
	});
});


// profile route by username
app.get('/profile/:username', isAuthenticated, (req, res) => {
    const loggedInUser = req.user;
    const requestedUsername = req.params.username;

    // Fetch user details from the database based on the requested username
    db.query('SELECT * FROM users WHERE username = ?', [requestedUsername], (err, userResult) => {
        if (err) throw err;

        if (userResult.length === 0) {
            return res.send('User does not exist');
        }

        const userProfile = userResult[0];

        // Fetch the topics the user is a member of
        db.query(
            'SELECT topics.name ' +
            'FROM topic_memberships ' +
            'INNER JOIN topics ON topic_memberships.topic_id = topics.id ' +
            'WHERE topic_memberships.user_id = ?',
            [userProfile.id],
            (err, topicsResult) => {
                if (err) throw err;

                const userTopics = topicsResult.map(topic => topic.name);

                // Fetch posts made by the user
                db.query(
                    'SELECT * FROM posts WHERE user_id = ?',
                    [userProfile.id],
                    (err, postsResult) => {
                        if (err) throw err;

                        const userPosts = postsResult;

                        res.render('profile', { userProfile, loggedInUser, userTopics, userPosts });
                    }
                );
            }
        );
    });
});





// profile route for the currently logged-in user
app.get('/profile', isAuthenticated, (req, res) => {
    const loggedInUser = req.user;

    // Fetch user details from the database based on the logged-in user
    db.query('SELECT * FROM users WHERE id = ?', [loggedInUser.id], (err, userResult) => {
        if (err) throw err;

        if (userResult.length === 0) {
            return res.send('User does not exist');
        }

        const userProfile = userResult[0];

        // Fetch the topics the user is a member of
        db.query(
            'SELECT topics.name FROM topic_memberships ' +
            'INNER JOIN topics ON topic_memberships.topic_id = topics.id ' +
            'WHERE topic_memberships.user_id = ?',
            [loggedInUser.id],
            (err, topicsResult) => {
                if (err) throw err;

                const userTopics = topicsResult.map(topic => topic.name);

                // Fetch posts made by the user
                db.query(
                    'SELECT * FROM posts WHERE user_id = ?',
                    [loggedInUser.id],
                    (err, postsResult) => {
                        if (err) throw err;

                        const userPosts = postsResult;

                        res.render('profile', { userProfile, loggedInUser, userTopics, userPosts });
                    }
                );
            }
        );
    });
});




// users route
app.get('/users', (req, res) => {
    const loggedInUser = req.user;

    db.query('SELECT username FROM users', (err, users) => {
        if (err) throw err;

        res.render('users', { users, loggedInUser });
    });
});



// Your login route
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, results) => {
        if (err) throw err;

        if (results.length > 0) {
            // Store user information in the session
            req.session.user = results[0];
            res.locals.loggedInUser = results[0];
            res.redirect('./');
        } else {
            res.render('login', { errorMessage: 'User does not exist.' });
        }
    });
});


// topics route
app.get('/topics', (req, res) => {
	db.query('SELECT * FROM topics', (err, results) => {
		if (err) throw err;

		res.render('topics', { topics: results });
	});
});

// topics id route
app.get('/topics/:id', isAuthenticated, (req, res) => {
    const topicId = parseInt(req.params.id);

    // Check if the parsed topicId is a valid number
    if (isNaN(topicId)) {
        return res.send('Invalid topic ID');
    }

    const loggedInUser = req.user;

    db.query(
        'SELECT name FROM topics WHERE id = ?',
        [topicId],
        (err, topicResult) => {
            if (err) {
                throw err;
            }

            if (topicResult.length === 0) {
                return res.send('Topic does not exist');
            }

            const topicName = topicResult[0].name;

            // Fetch both posts and their corresponding replies
            db.query(
                'SELECT posts.*, users.username, replies.content as replyContent, replies.created_at as replyCreatedAt ' +
                'FROM posts ' +
                'LEFT JOIN users ON posts.user_id = users.id ' +
                'LEFT JOIN replies ON posts.id = replies.post_id ' +
                'WHERE posts.topic_id = ?',
                [topicId],
                (err, posts) => {
                    if (err) throw err;

                    // Check if the user is already a member of the topic
                    db.query(
                        'SELECT COUNT(*) as count FROM topic_memberships WHERE user_id = ? AND topic_id = ?',
                        [loggedInUser.id, topicId],
                        (err, membershipCountResult) => {
                            if (err) throw err;

                            const isMember = membershipCountResult[0].count > 0;

                            res.render('topic', { topicId, topicName, posts, loggedInUser, isMember });
                        }
                    );
                }
            );
        }
    );
});


// join topic route
app.post('/join-topic/:topicId', isAuthenticated, (req, res) => {
    const topicId = req.params.topicId;
    const userId = req.user.id;

    // Insert the user into the topic_memberships table to join the topic
    db.query(
        'INSERT INTO topic_memberships (user_id, topic_id) VALUES (?, ?)',
        [userId, topicId],
        (err, result) => {
            if (err) throw err;

            res.redirect(`/topics/${topicId}`);
        }
    );
});

// details route
app.get('/details/:topicId', isAuthenticated, (req, res) => {
    const topicId = req.params.topicId;

    // Fetch details for the specified topic
    db.query('SELECT * FROM topics WHERE id = ?', [topicId], (err, topicResult) => {
        if (err) throw err;

        if (topicResult.length === 0) {
            return res.send('Topic does not exist');
        }

        const topicDetails = topicResult[0];

        // Render the details page with the topic information
        res.render('details', { topicDetails, loggedInUser: req.user });
    });
});



// create topic route
app.get('/create-topic', (req, res) => {
	res.render('create-topic');
});
app.post('/create-topic', (req, res) => {
	const { topicName } = req.body;

	db.query('INSERT INTO topics (name) VALUES (?)', [topicName], (err, result) => {
		if (err) throw err;

		// Get the ID of the last inserted topic
		const topicId = result.insertId;

		// Redirect to the newly created topic
		res.redirect(`/topics/${topicId}`);
	});
});

// create post route 
app.get('/create-post/:topicId', isAuthenticated, (req, res) => {
    const topicId = req.params.topicId;
    const loggedInUser = req.user;

    // Check if the logged-in user is a member of the specified topic
    db.query('SELECT COUNT(*) as count FROM topic_memberships WHERE user_id = ? AND topic_id = ?', [loggedInUser.id, topicId], (err, result) => {
        if (err) throw err;

        const isMember = result[0].count > 0;

        if (isMember) {
            res.render('create-post', { topicId, loggedInUser });
        } else {
            res.send('You are not a member of this topic and cannot create a post.');
        }
    });
});

app.post('/create-post/:topicId', isAuthenticated, (req, res) => {
    if (!req.user) {
        return res.redirect('./login');
    }

    const { title, content } = req.body;
    const userId = req.user.id;
    const topicId = req.params.topicId;

    // Check if the logged-in user is a member of the specified topic
    db.query('SELECT COUNT(*) as count FROM topic_memberships WHERE user_id = ? AND topic_id = ?', [userId, topicId], (err, result) => {
        if (err) throw err;

        const isMember = result[0].count > 0;

        if (isMember) {
            // User is a member, proceed to create the post
            db.query(
                'INSERT INTO posts (title, content, user_id, topic_id) VALUES (?, ?, ?, ?)',
                [title, content, userId, topicId],
                (err, result) => {
                    if (err) throw err;
                    res.redirect(`/topics/${topicId}`);
                }
            );
        } else {
            res.send('You are not a member of this topic and cannot create a post.');
        }
    });
});



// all posts route
app.get('/all-posts', (req, res) => {
	const searchQuery = req.query.search || ''; // Get the search query from the URL
	

	// Modify your query to include the search condition
	const query = 'SELECT * FROM posts WHERE title LIKE ? OR content LIKE ?';
	const params = [`%${searchQuery}%`, `%${searchQuery}%`];

	db.query(query, params, (err, posts) => {
		if (err) throw err;
		res.render('all-posts', { posts, loggedInUser: req.user });
	});
});

// reply route
app.get('/reply/:postId', isAuthenticated, (req, res) => {
	const postId = req.params.postId;
	const loggedInUser = req.user;

	// Fetch the post details to display in the reply form
	db.query('SELECT * FROM posts WHERE id = ?', [postId], (err, postResult) => {
		if (err) throw err;

		if (postResult.length === 0) {
			return res.send('Post does not exist');
		}

		const post = postResult[0];

		res.render('reply', { postId, post, loggedInUser });
	});
});

app.post('/reply/:postId', isAuthenticated, (req, res) => {
	if (!req.user) {
		return res.redirect('./login');
	}

	const { content } = req.body;
	const userId = req.user.id;
	const postId = req.params.postId;

	// Fetch the topic ID associated with the replied post
	db.query('SELECT topic_id FROM posts WHERE id = ?', [postId], (err, result) => {
		if (err) throw err;

		if (result.length === 0) {
			return res.send('Post does not exist');
		}

		const topicId = result[0].topic_id;

		// Insert the reply into the database
		db.query(
			'INSERT INTO replies (content, user_id, post_id) VALUES (?, ?, ?)',
			[content, userId, postId],
			(err, result) => {
				if (err) throw err;
				res.redirect(`/topics/${topicId}`);
			}
		);
	});
});


// delete post route
app.get('/delete-post/:postId', isAuthenticated, (req, res) => {
	const postId = req.params.postId;
	const loggedInUser = req.user;

	// Fetch the post details to confirm deletion
	db.query('SELECT * FROM posts WHERE id = ?', [postId], (err, postResult) => {
		if (err) throw err;

		if (postResult.length === 0) {
			return res.send('Post does not exist');
		}

		const post = postResult[0];

		// Check if the logged-in user is the owner of the post
		if (post.user_id !== loggedInUser.id) {
			return res.send('You do not have permission to delete this post.');
		}

		res.render('delete-post', { post, loggedInUser });
	});
});

app.post('/delete-post/:postId', isAuthenticated, (req, res) => {
	if (!req.user) {
		return res.redirect('./login');
	}

	const postId = req.params.postId;

	// Delete the post
	db.query('DELETE FROM posts WHERE id = ?', [postId], (err, result) => {
		if (err) throw err;
		res.redirect('/all-posts');
	});
});


// logout route
app.get('/logout', (req, res) => {
	req.session.destroy(err => {
		if (err) {
			console.error('Error destroying session:', err);
		}
		res.redirect('./');
	});
});


app.listen(port, () => {
	console.log(`Server listening on port ${port}`);
});
