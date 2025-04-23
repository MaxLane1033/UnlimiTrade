-- Insert an admin user
INSERT INTO Users (username, password_hash, profile_picture)
VALUES ('ethan', 'password', '/home/ethanadoyle/Soft_dev/UnlimiTrade/ProjectSourceCode/public/uploads/ethanprofile.png');

-- -- Insert test users
-- INSERT INTO Users (username, password_hash, profile_picture)
-- VALUES ('testuser2', 'password', '/uploads/user2.png');

-- -- Insert items for that user (use subquery to get correct ID)
-- INSERT INTO Items (user_id, name, description, category, status, image_path)
-- VALUES 
--   ((SELECT user_id FROM Users WHERE username = 'testuser2'), 'Vintage Clock', 'Antique clock.','test', 'available', '/uploads/clock.jpg');
--  -- ((SELECT user_id FROM Users WHERE username = 'testuser2'), 'Bluetooth Speaker', 'Great sound.', 'available', '/uploads/speaker.jpg');

