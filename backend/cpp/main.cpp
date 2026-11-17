
#include "queue.h"
#include <limits>

int main() {

    QueueManager manager;

    string operation;
    string businessId;
    string customerName;
    string nextTokenText;
    string countText;

    // Read the request from Node.js
    if (!getline(cin, operation)) return 1;
    if (!getline(cin, businessId)) return 1;
    if (!getline(cin, customerName)) return 1;
    if (!getline(cin, nextTokenText)) return 1;
    if (!getline(cin, countText)) return 1;

    int savedTokenCount = 0;
    int recordCount = 0;

    try {
        savedTokenCount = stoi(nextTokenText);
        recordCount = stoi(countText);
    } catch (...) {
        cerr << "Invalid request numbers";
        return 1;
    }

    if (recordCount < 0 || recordCount > 100000) {
        cerr << "Invalid customer record count";
        return 1;
    }

    manager.setNextToken(businessId, savedTokenCount);

    // Load customer records supplied by Node.js
    for (int i = 0; i < recordCount; i++) {

        string line;

        if (!getline(cin, line)) {
            cerr << "Incomplete customer records";
            return 1;
        }

        size_t firstTab = line.find('\t');
        size_t secondTab = line.find('\t', firstTab + 1);

        if (firstTab == string::npos ||
            secondTab == string::npos) {
            cerr << "Invalid customer record";
            return 1;
        }

        Customer customer;

        customer.token = line.substr(0, firstTab);
        customer.name = line.substr(
            firstTab + 1,
            secondTab - firstTab - 1
        );
        customer.status = line.substr(secondTab + 1);
        customer.businessId = businessId;

        manager.loadCustomer(customer);
    }

    string result = "";

    // Perform the requested operation
    if (operation == "add") {

        result = manager.addCustomer(
            customerName,
            businessId
        );

    } else if (operation == "call") {

        result = manager.callNext(businessId);

    } else if (operation == "complete") {

        result = manager.completeCurrent(businessId)
            ? "OK" : "";

    } else if (operation == "skip") {

        result = manager.skipCurrent(businessId)
            ? "OK" : "";

    } else if (operation != "list") {

        cerr << "Unknown operation";
        return 1;
    }

    // Return the operation result
    cout << "RESULT\t" << result << '\n';

    cout << "NEXT\t"
         << manager.getNextToken(businessId) << '\n';

    cout << "SERVING\t"
         << manager.getCurrentServing(businessId) << '\n';

    // Return all customer statuses to Node.js
    vector<Customer> customers =
        manager.getCustomers(businessId);

    for (const Customer& customer : customers) {

        cout << "ROW\t"
             << customer.token << '\t'
             << customer.status << '\n';
    }

    return 0;
}
