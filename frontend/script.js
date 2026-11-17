
const API = "/api";

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = document.getElementById("loginMessage");
    message.textContent = "Logging in...";

    try {
        const response = await fetch(`${API}/business/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
                email: document.getElementById("loginEmail").value,
                password: document.getElementById("loginPassword").value
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || data.error || "Login failed");
        }

        window.location.href = "dashboard.html";
    } catch (error) {
        message.textContent = error.message;
    }
});

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = document.getElementById("registerMessage");
    message.textContent = "Registering business...";

    try {
        const response = await fetch(`${API}/business/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
                businessName: document.getElementById("businessName").value,
                ownerName: document.getElementById("ownerName").value,
                email: document.getElementById("registerEmail").value,
                password: document.getElementById("registerPassword").value
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || data.error || "Registration failed");
        }

        window.location.href = "dashboard.html";
    } catch (error) {
        message.textContent = error.message;
    }
});

let qrScanner = null;

document.getElementById("scanButton").addEventListener("click", async () => {
    const message = document.getElementById("scanMessage");
    const reader = document.getElementById("reader");

    if (typeof Html5Qrcode === "undefined") {
        message.textContent = "QR scanner library could not load. Check your internet connection.";
        return;
    }

    if (qrScanner) return;

    qrScanner = new Html5Qrcode("reader");
    message.textContent = "Allow camera access to scan the business QR code.";

    try {
        await qrScanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            async (decodedText) => {
                try {
                    const url = new URL(decodedText);
                    const businessId = url.searchParams.get("business");

                    if (
                        !businessId ||
                        url.origin !== window.location.origin ||
                        !url.pathname.endsWith("/customer.html")
                    ) {
                        message.textContent = "This is not a valid SmartQueue business QR code.";
                        return;
                    }

                    await qrScanner.stop();
                    qrScanner.clear();
                    qrScanner = null;

                    window.location.href = url.href;
                } catch {
                    message.textContent = "Invalid QR code. Please scan a SmartQueue business QR code.";
                }
            }
        );
    } catch (error) {
        message.textContent = "Camera could not start. Check browser camera permissions.";
        qrScanner = null;
    }
});
