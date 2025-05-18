import React from 'react';

export default function AutomationsPage() {
  // Placeholder data for rules
  const rules = [
    { id: 1, pattern: 'AMAZON', category: 'Office Supplies', enabled: true },
    { id: 2, pattern: 'STARBUCKS', category: 'Coffee', enabled: false },
  ];

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Automations & Categorization Rules</h1>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-lg font-semibold">Rules</h2>
        <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">+ Add Rule</button>
      </div>
      <table className="w-full border-collapse border border-gray-300 mb-8">
        <thead className="bg-gray-100">
          <tr>
            <th className="border p-2 text-left">Pattern</th>
            <th className="border p-2 text-left">Category</th>
            <th className="border p-2 text-center">Enabled</th>
            <th className="border p-2 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rules.map(rule => (
            <tr key={rule.id}>
              <td className="border p-2">{rule.pattern}</td>
              <td className="border p-2">{rule.category}</td>
              <td className="border p-2 text-center">{rule.enabled ? 'Yes' : 'No'}</td>
              <td className="border p-2 text-center">
                <button className="text-blue-600 hover:underline mr-2">Edit</button>
                <button className="text-red-600 hover:underline">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Placeholder for Add/Edit Rule Modal */}
      {/* Placeholder for Run Automations button */}
    </div>
  );
} 