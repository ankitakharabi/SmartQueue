
#ifndef QUEUE_H
#define QUEUE_H

#include <iostream>
#include <string>
#include <queue>
#include <unordered_map>
#include <vector>

using namespace std;

struct Customer {
    string name;
    string token;
    string businessId;
    string status;
};

struct CustomerNode {
    Customer data;
    CustomerNode* next;

    CustomerNode(const Customer& customer)
        : data(customer), next(nullptr) {}
};

class QueueManager {
private:
    unordered_map<string, queue<string>> waitingQueues;
    unordered_map<string, CustomerNode*> customerLists;
    unordered_map<string, CustomerNode*> listTails;
    unordered_map<string, CustomerNode*> tokenTable;

    unordered_map<string, int> nextToken;
    unordered_map<string, string> currentServing;

    string makeToken(int number);

public:
    QueueManager();

    void setNextToken(string businessId, int number);

    void loadCustomer(const Customer& customer);

    string addCustomer(string name, string businessId);

    string callNext(string businessId);

    bool completeCurrent(string businessId);

    bool skipCurrent(string businessId);

    vector<Customer> getCustomers(string businessId);

    int getNextToken(string businessId);

    string getCurrentServing(string businessId);

    ~QueueManager();

    QueueManager(const QueueManager&) = delete;
    QueueManager& operator=(const QueueManager&) = delete;
};

#endif
