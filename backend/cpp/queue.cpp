
#include "queue.h"
#include <sstream>
#include <iomanip>

QueueManager::QueueManager() {
}

string QueueManager::makeToken(int number) {
    ostringstream output;
    output << "A" << setw(3) << setfill('0') << number;
    return output.str();
}

void QueueManager::setNextToken(string businessId, int number) {
    nextToken[businessId] = number;
}

// Load an existing customer from MySQL data
void QueueManager::loadCustomer(const Customer& customer) {

    string businessId = customer.businessId;

    CustomerNode* node = new CustomerNode(customer);

    if (customerLists[businessId] == nullptr) {
        customerLists[businessId] = node;
    } else {
        listTails[businessId]->next = node;
    }

    listTails[businessId] = node;

    string key = businessId + "_" + customer.token;
    tokenTable[key] = node;

    if (customer.status == "Waiting") {
        waitingQueues[businessId].push(customer.token);
    }

    if (customer.status == "Serving") {
        currentServing[businessId] = customer.token;
    }
}

// Add a customer
string QueueManager::addCustomer(string name, string businessId) {

    if (name.empty() || businessId.empty()) {
        return "";
    }

    int number = ++nextToken[businessId];
    string token = makeToken(number);

    Customer customer;
    customer.name = name;
    customer.token = token;
    customer.businessId = businessId;
    customer.status = "Waiting";

    CustomerNode* node = new CustomerNode(customer);

    if (customerLists[businessId] == nullptr) {
        customerLists[businessId] = node;
    } else {
        listTails[businessId]->next = node;
    }

    listTails[businessId] = node;

    string key = businessId + "_" + token;
    tokenTable[key] = node;

    waitingQueues[businessId].push(token);

    return token;
}

// Call the next waiting customer
string QueueManager::callNext(string businessId) {

    // A serving customer must be completed or skipped first
    if (!currentServing[businessId].empty()) {
        return "";
    }

    if (waitingQueues[businessId].empty()) {
        return "";
    }

    string token = waitingQueues[businessId].front();
    waitingQueues[businessId].pop();

    string key = businessId + "_" + token;

    auto found = tokenTable.find(key);

    if (found == tokenTable.end()) {
        return "";
    }

    found->second->data.status = "Serving";
    currentServing[businessId] = token;

    return token;
}

// Complete the current customer
bool QueueManager::completeCurrent(string businessId) {

    string token = currentServing[businessId];

    if (token.empty()) {
        return false;
    }

    string key = businessId + "_" + token;
    auto found = tokenTable.find(key);

    if (found == tokenTable.end()) {
        return false;
    }

    found->second->data.status = "Completed";
    currentServing[businessId] = "";

    return true;
}

// Skip the current customer
bool QueueManager::skipCurrent(string businessId) {

    string token = currentServing[businessId];

    if (token.empty()) {
        return false;
    }

    string key = businessId + "_" + token;
    auto found = tokenTable.find(key);

    if (found == tokenTable.end()) {
        return false;
    }

    found->second->data.status = "Skipped";
    currentServing[businessId] = "";

    return true;
}

// Return all customer records
vector<Customer> QueueManager::getCustomers(string businessId) {

    vector<Customer> result;

    CustomerNode* current = customerLists[businessId];

    while (current != nullptr) {
        result.push_back(current->data);
        current = current->next;
    }

    return result;
}

int QueueManager::getNextToken(string businessId) {
    return nextToken[businessId];
}

string QueueManager::getCurrentServing(string businessId) {
    return currentServing[businessId];
}

// Free linked-list memory
QueueManager::~QueueManager() {

    for (auto& business : customerLists) {

        CustomerNode* current = business.second;

        while (current != nullptr) {
            CustomerNode* next = current->next;
            delete current;
            current = next;
        }
    }
}
