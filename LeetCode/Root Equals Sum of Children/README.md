# Solution

You are given the root of a binary tree that consists of exactly 3 nodes: the root, its left child, and its right child.

Return true if the value of the root is equal to the sum of the values of its two children, or false otherwise.

Example 1:

Input: root = [10,4,6]
Output: true
Explanation: The values of the root, its left child, and its right child are 10, 4, and 6, respectively.
10 is equal to 4 + 6, so we return true.

Example 2:

Input: root = [5,3,1]
Output: false
Explanation: The values of the root, its left child, and its right child are 5, 3, and 1, respectively.
5 is not equal to 3 + 1, so we return false.

Constraints:

The tree consists only of the root, its left child, and its right child.
-100 <= Node.val <= 100

## Intuition

Given a tree node, check if its value is equal to the sum of its immediate left and right child nodes.

## Approach

1. For each node, check its value against the sum of its left and right child nodes.
2. If they're equal, return true, otherwise return false.

## Complexity

Time complexity: Given the current approach, it only checks for the current node and does not traverse through the tree. Thus, the time complexity is $O(1)$.
Space complexity: Since no extra space is used that scales with input size, space complexity is $O(1)$.
