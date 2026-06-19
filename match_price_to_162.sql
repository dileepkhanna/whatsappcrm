-- If browser cache won't clear, match the database price to what frontend shows
-- This makes Plan Price = Razorpay Price = Rs 162

UPDATE plan SET price = 162 WHERE id = 2;

-- Verify the change
SELECT id, title, price FROM plan WHERE id = 2;
