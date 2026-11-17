const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const pool = require("./db");
const runQueueEngine = require("./cppBridge");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(
    path.join(__dirname, "..", "frontend")
));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Check whether a business is logged in
function requireBusiness(req, res, next) {
    if (!req.session.businessId) {
        return res.status(401).json({
            success: false,
            message: "Please log in first"
        });
    }

    next();
}

// Queue operation: MySQL -> C++ -> MySQL
async function performQueueOperation(
    businessId,
    operation,
    customerName = ""
) {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Lock this business row to prevent simultaneous token allocation
        const [businessRows] = await connection.execute(
            `SELECT business_id, next_token
             FROM businesses
             WHERE business_id = ?
             FOR UPDATE`,
            [businessId]
        );

        if (businessRows.length === 0) {
            throw new Error("Business not found");
        }

        const nextToken = Number(businessRows[0].next_token || 0);

        // Load this business's customer records
        const [customers] = await connection.execute(
            `SELECT token_number, customer_name, status
             FROM customers
             WHERE business_id = ?
             ORDER BY id ASC`,
            [businessId]
        );

        // Send records and requested operation to C++
        const result = await runQueueEngine({
            operation,
            businessId,
            customerName,
            nextToken,
            customers
        });

        // Save newly created customer
        let ticketId = null;

        if (operation === "add") {
            if (!result.result) {
                throw new Error("C++ could not create a customer token");
            }

            const number = Number(
                result.result.replace(/^A/, "")
            );

            if (!Number.isInteger(number) || number <= 0) {
                throw new Error("C++ returned an invalid token");
            }

            ticketId = crypto.randomUUID();

            await connection.execute(
                `INSERT INTO customers
                 (ticket_id, business_id, customer_name, token_number, status)
                 VALUES (?, ?, ?, ?, 'Waiting')`,
                [
                    ticketId,
                    businessId,
                    customerName,
                    number
                ]
            );
        }

        // Save the updated token counter
        await connection.execute(
            `UPDATE businesses
             SET next_token = ?
             WHERE business_id = ?`,
            [result.nextToken, businessId]
        );

        // Persist statuses returned by C++
        for (const [token, status] of Object.entries(result.statuses)) {
            const number = Number(token.replace(/^A/, ""));

            await connection.execute(
                `UPDATE customers
                 SET status = ?
                 WHERE business_id = ? AND token_number = ?`,
                [status, businessId, number]
            );
        }

        // Read the final saved queue
        const [updatedCustomers] = await connection.execute(
            `SELECT ticket_id, customer_name, token_number, status, created_at
             FROM customers
             WHERE business_id = ?
             ORDER BY id ASC`,
            [businessId]
        );

        await connection.commit();

        return {
            result: result.result,
            ticketId,
            currentServing: result.currentServing,
            customers: updatedCustomers
        };

    } catch (error) {
        await connection.rollback();
        throw error;

    } finally {
        connection.release();
    }
}

// Health check
app.get("/api/health", async (req, res) => {
    try {
        const [rows] = await pool.query(
            "SELECT DATABASE() AS databaseName"
        );

        res.json({
            success: true,
            message: "SmartQueue backend connected successfully",
            database: rows[0].databaseName
        });

    } catch (error) {
        console.error(error.message);

        res.status(500).json({
            success: false,
            message: "Database connection failed"
        });
    }
});

// BUSINESS REGISTRATION
app.post("/api/business/register", async (req, res) => {
    try {
        const { businessName, ownerName, email, password } = req.body;

        if (
            !businessName?.trim() ||
            !ownerName?.trim() ||
            !email?.trim() ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "All fields are required"
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 8 characters"
            });
        }

        const businessId = crypto.randomUUID();
        const passwordHash = await bcrypt.hash(password, 12);

        await pool.execute(
            `INSERT INTO businesses
             (business_id, business_name, owner_name, email, password_hash, next_token)
             VALUES (?, ?, ?, ?, ?, 0)`,
            [
                businessId,
                businessName.trim(),
                ownerName.trim(),
                email.trim().toLowerCase(),
                passwordHash
            ]
        );

        req.session.businessId = businessId;

        res.status(201).json({
            success: true,
            message: "Business registered successfully",
            businessId,
            businessName: businessName.trim()
        });

    } catch (error) {
        console.error("Registration error:", error.message);

        res.status(error.code === "ER_DUP_ENTRY" ? 409 : 500).json({
            success: false,
            message: error.code === "ER_DUP_ENTRY"
                ? "This email is already registered"
                : "Registration failed"
        });
    }
});

// BUSINESS LOGIN
app.post("/api/business/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required"
            });
        }

        const [rows] = await pool.execute(
            `SELECT business_id, business_name, password_hash
             FROM businesses
             WHERE email = ?`,
            [email.trim().toLowerCase()]
        );

        if (
            rows.length === 0 ||
            !(await bcrypt.compare(password, rows[0].password_hash))
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        req.session.businessId = rows[0].business_id;

        res.json({
            success: true,
            message: "Login successful",
            businessId: rows[0].business_id,
            businessName: rows[0].business_name
        });

    } catch (error) {
        console.error("Login error:", error.message);

        res.status(500).json({
            success: false,
            message: "Login failed"
        });
    }
});

// CHECK LOGGED-IN BUSINESS
app.get("/api/business/me", requireBusiness, async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT business_id, business_name, owner_name, email
             FROM businesses
             WHERE business_id = ?`,
            [req.session.businessId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Business not found"
            });
        }

        res.json({
            success: true,
            business: rows[0]
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Could not load business"
        });
    }
});

// BUSINESS LOGOUT
app.post("/api/business/logout", requireBusiness, (req, res) => {
    req.session.destroy(() => {
        res.json({
            success: true,
            message: "Logged out successfully"
        });
    });
});

// PUBLIC BUSINESS DETAILS FOR CUSTOMER QR PAGE
app.get("/api/business/public/:businessId", async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT business_id, business_name
             FROM businesses
             WHERE business_id = ?`,
            [req.params.businessId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Business not found"
            });
        }

        res.json({
            success: true,
            business: rows[0]
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Could not load business"
        });
    }
});

// BUSINESS DASHBOARD QUEUE
app.get("/api/business/queue", requireBusiness, async (req, res) => {
    try {
        const result = await performQueueOperation(
            req.session.businessId,
            "list"
        );

        res.json({
            success: true,
            customers: result.customers,
            currentServing: result.currentServing
        });

    } catch (error) {
        console.error("Queue error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not load queue"
        });
    }
});

// CALL NEXT CUSTOMER
app.post("/api/business/call-next", requireBusiness, async (req, res) => {
    try {
        const result = await performQueueOperation(
            req.session.businessId,
            "call"
        );

        if (!result.result) {
            return res.status(409).json({
                success: false,
                message: "No waiting customer, or a customer is already being served"
            });
        }

        res.json({
            success: true,
            token: result.result,
            customers: result.customers
        });

    } catch (error) {
        console.error(error.message);

        res.status(500).json({
            success: false,
            message: "Could not call next customer"
        });
    }
});

// COMPLETE CURRENT CUSTOMER
app.post("/api/business/complete-current", requireBusiness, async (req, res) => {
    try {
        const result = await performQueueOperation(
            req.session.businessId,
            "complete"
        );

        if (result.result !== "OK") {
            return res.status(409).json({
                success: false,
                message: "No customer is currently being served"
            });
        }

        res.json({
            success: true,
            message: "Customer completed",
            customers: result.customers
        });

    } catch (error) {
        console.error(error.message);

        res.status(500).json({
            success: false,
            message: "Could not complete customer"
        });
    }
});

// SKIP CURRENT CUSTOMER
app.post("/api/business/skip-current", requireBusiness, async (req, res) => {
    try {
        const result = await performQueueOperation(
            req.session.businessId,
            "skip"
        );

        if (result.result !== "OK") {
            return res.status(409).json({
                success: false,
                message: "No customer is currently being served"
            });
        }

        res.json({
            success: true,
            message: "Customer skipped",
            customers: result.customers
        });

    } catch (error) {
        console.error(error.message);

        res.status(500).json({
            success: false,
            message: "Could not skip customer"
        });
    }
});

// CUSTOMER JOINS USING BUSINESS QR LINK
app.post("/api/customer/join", async (req, res) => {
    try {
        const { name, businessId } = req.body;

        if (
            typeof name !== "string" ||
            !name.trim() ||
            name.trim().length > 100 ||
            /[\t\r\n]/.test(name)
        ) {
            return res.status(400).json({
                success: false,
                message: "Enter a valid name"
            });
        }

        if (!businessId) {
            return res.status(400).json({
                success: false,
                message: "Business ID is required"
            });
        }

        const [businessRows] = await pool.execute(
            "SELECT business_id FROM businesses WHERE business_id = ?",
            [businessId]
        );

        if (businessRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Business not found"
            });
        }

        const result = await performQueueOperation(
            businessId,
            "add",
            name.trim()
        );

        const number = Number(result.result.replace(/^A/, ""));

        res.status(201).json({
            success: true,
            message: "You joined the queue",
            ticketId: result.ticketId,
            token: result.result,
            tokenNumber: number,
            businessId
        });

    } catch (error) {
        console.error("Customer join error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not join queue"
        });
    }
});

// CUSTOMER TICKET STATUS
app.get("/api/customer/ticket/:ticketId", async (req, res) => {
    try {
        const [rows] = await pool.execute(
            `SELECT
                c.ticket_id,
                c.customer_name,
                c.token_number,
                c.status,
                c.business_id,
                b.business_name
             FROM customers c
             JOIN businesses b
                ON c.business_id = b.business_id
             WHERE c.ticket_id = ?`,
            [req.params.ticketId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found"
            });
        }

        const customer = rows[0];

        const [aheadRows] = await pool.execute(
            `SELECT COUNT(*) AS peopleAhead
             FROM customers
             WHERE business_id = ?
               AND token_number < ?
               AND status = 'Waiting'`,
            [customer.business_id, customer.token_number]
        );

        const [servingRows] = await pool.execute(
            `SELECT token_number
             FROM customers
             WHERE business_id = ?
               AND status = 'Serving'
             LIMIT 1`,
            [customer.business_id]
        );

        res.json({
            success: true,
            ticket: {
                ticketId: customer.ticket_id,
                customerName: customer.customer_name,
                token: "A" + String(customer.token_number).padStart(3, "0"),
                businessName: customer.business_name,
                status: customer.status,
                peopleAhead: customer.status === "Waiting"
                    ? aheadRows[0].peopleAhead
                    : 0,
                currentServing: servingRows.length
                    ? "A" + String(servingRows[0].token_number).padStart(3, "0")
                    : "None"
            }
        });

    } catch (error) {
        console.error("Ticket error:", error.message);

        res.status(500).json({
            success: false,
            message: "Could not load ticket"
        });
    }
});

// Start server
async function startServer() {
    try {
        await pool.query("SELECT 1");

        app.listen(PORT, () => {
            console.log("SmartQueue backend is running");
            console.log(`Server: http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error("Backend startup failed:", error.message);
        process.exit(1);
    }
}

startServer();
