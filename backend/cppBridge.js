
const { spawn } = require("child_process");
const path = require("path");

const executableName =
    process.platform === "win32"
        ? "SmartQueue.exe"
        : "SmartQueue";

const cppProgram = path.join(
    __dirname,
    "cpp",
    executableName
);

function runQueueEngine({
    operation,
    businessId,
    customerName = "",
    nextToken = 0,
    customers = []
}) {
    return new Promise((resolve, reject) => {

        const allowedOperations = [
            "add",
            "call",
            "complete",
            "skip",
            "list"
        ];

        if (!allowedOperations.includes(operation)) {
            return reject(new Error("Invalid queue operation"));
        }

        const values = [
            operation,
            businessId,
            customerName,
            String(nextToken),
            String(customers.length)
        ];

        for (const customer of customers) {
            const token = `A${String(customer.token_number).padStart(3, "0")}`;
            const name = String(customer.customer_name);
            const status = String(customer.status);

            if (/[\t\r\n]/.test(name)) {
                return reject(
                    new Error("Customer name contains an unsupported character")
                );
            }

            values.push(`${token}\t${name}\t${status}`);
        }

        const input = values.join("\n") + "\n";

        const child = spawn(cppProgram, [], {
            windowsHide: true
        });

        let output = "";
        let errors = "";

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");

        child.stdout.on("data", data => {
            output += data;
        });

        child.stderr.on("data", data => {
            errors += data;
        });

        child.on("error", error => reject(error));

        child.on("close", code => {
            if (code !== 0) {
                return reject(
                    new Error(errors || `C++ process exited with code ${code}`)
                );
            }

            const result = {
                result: "",
                nextToken: 0,
                currentServing: "",
                statuses: {}
            };

            const lines = output.trim().split(/\r?\n/);

            for (const line of lines) {
                const parts = line.split("\t");

                if (parts[0] === "RESULT") {
                    result.result = parts[1] || "";
                }

                if (parts[0] === "NEXT") {
                    result.nextToken = Number(parts[1]);
                }

                if (parts[0] === "SERVING") {
                    result.currentServing = parts[1] || "";
                }

                if (parts[0] === "ROW") {
                    result.statuses[parts[1]] = parts[2];
                }
            }

            resolve(result);
        });

        child.stdin.on("error", error => reject(error));
        child.stdin.end(input);
    });
}

module.exports = runQueueEngine;
