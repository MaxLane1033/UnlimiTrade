
CREATE TABLE IF NOT EXISTS Users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    profile_picture TEXT /*testing this for editing a profile picture*/
);

CREATE TABLE IF NOT EXISTS Items (
    item_id SERIAL PRIMARY KEY,
    user_id INT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(100),
    image_path TEXT,
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

CREATE TABLE IF NOT EXISTS TradeBlock (
    trade_id SERIAL PRIMARY KEY,
    proposer_id INT,
    receiver_id INT,
status VARCHAR(100),
    FOREIGN KEY (proposer_id) REFERENCES Users(user_id),
    FOREIGN KEY (receiver_id) REFERENCES Users(user_id)
);

CREATE TABLE IF NOT EXISTS TradeDetails (
    trade_id INT,
    item_id INT,
    shipping_address VARCHAR(100),
    PRIMARY KEY (trade_id, item_id),
    FOREIGN KEY (trade_id) REFERENCES TradeBlock(trade_id),
    FOREIGN KEY (item_id) REFERENCES Items(item_id)
);

CREATE TABLE IF NOT EXISTS Reviews (
    review_id SERIAL PRIMARY KEY,
    reviewer_id INT,
    reviewed_id INT,
    rating INT CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    FOREIGN KEY (reviewer_id) REFERENCES Users(user_id),
    FOREIGN KEY (reviewed_id) REFERENCES Users(user_id)
);

--This is for the trading between users
CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    sender_id INT REFERENCES Users(user_id),
    receiver_id INT REFERENCES Users(user_id),
    offered_item_id INT REFERENCES Items(item_id),
    requested_item_id INT REFERENCES Items(item_id),
    message TEXT,
    status VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
