DROP TABLE IF EXISTS Reviews;
DROP TABLE IF EXISTS TradeDetails;
DROP TABLE IF EXISTS TradeBlock;
DROP TABLE IF EXISTS Items;
DROP TABLE IF EXISTS Users;
CREATE TABLE Users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL
);

CREATE TABLE Items (
    item_id SERIAL PRIMARY KEY,
    user_id INT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    status VARCHAR(100),
    FOREIGN KEY (user_id) REFERENCES Users(user_id)
);

CREATE TABLE TradeBlock (
    trade_id SERIAL PRIMARY KEY,
    proposer_id INT,
    receiver_id INT,
status VARCHAR(100),
    FOREIGN KEY (proposer_id) REFERENCES Users(user_id),
    FOREIGN KEY (receiver_id) REFERENCES Users(user_id)
);

CREATE TABLE TradeDetails (
    trade_id INT,
    item_id INT,
    shipping_address VARCHAR(100),
    PRIMARY KEY (trade_id, item_id),
    FOREIGN KEY (trade_id) REFERENCES TradeBlock(trade_id),
    FOREIGN KEY (item_id) REFERENCES Items(item_id)
);

CREATE TABLE Reviews (
    review_id SERIAL PRIMARY KEY,
    reviewer_id INT,
    reviewed_id INT,
    rating INT CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    FOREIGN KEY (reviewer_id) REFERENCES Users(user_id),
    FOREIGN KEY (reviewed_id) REFERENCES Users(user_id)
);
