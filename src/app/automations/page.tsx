"use client";

import React, { useEffect, useState } from "react";
import { useApiWithCompany } from "@/hooks/useApiWithCompany";
import { supabase } from "../../lib/supabase";
import { Select } from "@/components/ui/select";
import Papa from "papaparse";
import { v4 as uuidv4 } from "uuid";
import { X } from "lucide-react";

type PayeeAutomation = {
  id: string;
  name: string;
  condition_type: string;
  condition_value: string;
  payee_name: string;
  company_id: string;
  enabled: boolean;
  auto_add: boolean;
};

type CategoryAutomation = {
  id: string;
  name: string;
  condition_type: string;
  condition_value: string;
  category_name: string;
  company_id: string;
  enabled: boolean;
  auto_add: boolean;
};

type Payee = {
  id: string;
  name: string;
  company_id: string;
};

type SelectOption = {
  value: string;
  label: string;
};

type AutomationImportData = {
  id: string;
  name: string;
  automation_type: string;
  condition_type: string;
  condition_value: string;
  action_value: string;
  company_id: string | undefined;
  enabled: boolean;
  // Validation fields
  isValid: boolean;
  validationMessage?: string;
  needsCreation?: boolean; // Whether the payee/category needs to be created
};

type AutomationImportModalState = {
  isOpen: boolean;
  step: "upload" | "review";
  csvData: AutomationImportData[];
  isLoading: boolean;
  error: string | null;
  selectedAutomations: Set<string>;
  autoCreateMissing: boolean; // Whether to auto-create missing payees/categories
};

type AutomationCSVRow = {
  Name: string;
  Type: string;
  "Condition Type": string;
  "Condition Value": string;
  "Action Value": string;
};

export default function AutomationsPage() {
  const { hasCompanyContext, currentCompany } = useApiWithCompany();

  // State for payee automations
  const [payeeAutomations, setPayeeAutomations] = useState<PayeeAutomation[]>([]);
  const [payeeSearch, setPayeeSearch] = useState("");

  // State for category automations
  const [categoryAutomations, setCategoryAutomations] = useState<CategoryAutomation[]>([]);
  const [categorySearch, setCategorySearch] = useState("");

  // Available payees for dropdown
  const [availablePayees, setAvailablePayees] = useState<Payee[]>([]);

  // Available categories for dropdown
  const [availableCategories, setAvailableCategories] = useState<{ id: string; name: string }[]>([]);

  // Import modal state
  const [automationImportModal, setAutomationImportModal] = useState<AutomationImportModalState>({
    isOpen: false,
    step: "upload",
    csvData: [],
    isLoading: false,
    error: null,
    selectedAutomations: new Set(),
    autoCreateMissing: false,
  });

  // Note: Automation application loading state removed as automations
  // are now handled in transactions page only

  // Add new state for payee automation modal
  const [payeeAutomationModal, setPayeeAutomationModal] = useState<{
    isOpen: boolean;
    isEditing: boolean;
    editingId: string | null;
    name: string;
    condition: string;
    conditionType: string;
    action: string;
    transactionType: string;
    autoAdd: boolean;
  }>({
    isOpen: false,
    isEditing: false,
    editingId: null,
    name: "",
    condition: "",
    conditionType: "contains",
    action: "",
    transactionType: "All",
    autoAdd: false,
  });

  // Add new state for category automation modal
  const [categoryAutomationModal, setCategoryAutomationModal] = useState<{
    isOpen: boolean;
    isEditing: boolean;
    editingId: string | null;
    name: string;
    condition: string;
    conditionType: string;
    action: string;
    transactionType: string;
    autoAdd: boolean;
  }>({
    isOpen: false,
    isEditing: false,
    editingId: null,
    name: "",
    condition: "",
    conditionType: "contains",
    action: "",
    transactionType: "All",
    autoAdd: false,
  });

  // Add validation error states
  const [payeeModalErrors, setPayeeModalErrors] = useState<{
    name: boolean;
    condition: boolean;
    action: boolean;
  }>({
    name: false,
    condition: false,
    action: false,
  });

  const [categoryModalErrors, setCategoryModalErrors] = useState<{
    name: boolean;
    condition: boolean;
    action: boolean;
  }>({
    name: false,
    condition: false,
    action: false,
  });

  // Note: Helper function moved to transactions page where automations are now applied

  // Note: Automation application is now handled in the transactions page
  // Function removed - automations are applied as temporary UI state in transactions page only

  useEffect(() => {
    if (hasCompanyContext) {
      fetchPayeeAutomations();
      fetchCategoryAutomations();
      fetchAvailablePayees();
      fetchAvailableCategories();
    }
  }, [currentCompany?.id, hasCompanyContext]);

  // Apply automations whenever automations or available payees/categories change
  // Note: Automation application removed - automations now only apply in transactions page

  const fetchPayeeAutomations = async () => {
    if (!hasCompanyContext) return;

    try {
      const { data, error } = await supabase
        .from("automations")
        .select("*")
        .eq("company_id", currentCompany!.id)
        .eq("automation_type", "payee")
        .order("name");

      if (error) {
        console.error("Error fetching payee automations:", error);
        // Fallback to empty array if database is not available
        setPayeeAutomations([]);
        return;
      }

      const transformedData: PayeeAutomation[] = data.map((automation) => ({
        id: automation.id,
        name: automation.name,
        condition_type: automation.condition_type,
        condition_value: automation.condition_value,
        payee_name: automation.action_value,
        company_id: automation.company_id,
        enabled: automation.enabled,
        auto_add: automation.auto_add || false,
      }));

      setPayeeAutomations(transformedData);
    } catch (error) {
      console.error("Error fetching payee automations:", error);
      // Fallback to empty array if database connection fails
      setPayeeAutomations([]);
    }
  };

  const fetchCategoryAutomations = async () => {
    if (!hasCompanyContext) return;

    try {
      const { data, error } = await supabase
        .from("automations")
        .select("*")
        .eq("company_id", currentCompany!.id)
        .eq("automation_type", "category")
        .order("name");

      if (error) {
        console.error("Error fetching category automations:", error);
        // Fallback to empty array if database is not available
        setCategoryAutomations([]);
        return;
      }

      const transformedData: CategoryAutomation[] = data.map((automation) => ({
        id: automation.id,
        name: automation.name,
        condition_type: automation.condition_type,
        condition_value: automation.condition_value,
        category_name: automation.action_value,
        company_id: automation.company_id,
        enabled: automation.enabled,
        auto_add: automation.auto_add || false,
      }));

      setCategoryAutomations(transformedData);
    } catch (error) {
      console.error("Error fetching category automations:", error);
      // Fallback to empty array if database connection fails
      setCategoryAutomations([]);
    }
  };

  const fetchAvailablePayees = async () => {
    if (!hasCompanyContext) return;

    const { data, error } = await supabase
      .from("payees")
      .select("*")
      .eq("company_id", currentCompany!.id)
      .order("name");

    if (!error && data) {
      setAvailablePayees(data);
    }
  };

  const fetchAvailableCategories = async () => {
    if (!hasCompanyContext) return;

    const { data, error } = await supabase
      .from("chart_of_accounts")
      .select("id, name")
      .eq("company_id", currentCompany!.id)
      .order("name");

    if (!error && data) {
      setAvailableCategories(data);
    }
  };

  const handleDeletePayeeAutomation = async (id: string) => {
    try {
      const { error } = await supabase
        .from("automations")
        .delete()
        .eq("id", id)
        .eq("company_id", currentCompany!.id)
        .eq("automation_type", "payee");

      if (error) {
        console.error("Error deleting payee automation:", error);
        return;
      }

      // Update local state
      setPayeeAutomations((prev) => prev.filter((automation) => automation.id !== id));
    } catch (error) {
      console.error("Error deleting payee automation:", error);
    }
  };

  const handleDeleteCategoryAutomation = async (id: string) => {
    try {
      const { error } = await supabase
        .from("automations")
        .delete()
        .eq("id", id)
        .eq("company_id", currentCompany!.id)
        .eq("automation_type", "category");

      if (error) {
        console.error("Error deleting category automation:", error);
        return;
      }

      // Update local state
      setCategoryAutomations((prev) => prev.filter((automation) => automation.id !== id));
    } catch (error) {
      console.error("Error deleting category automation:", error);
    }
  };

  // New function to open payee automation modal for editing
  const openPayeeAutomationForEdit = (automation: PayeeAutomation) => {
    setPayeeAutomationModal({
      isOpen: true,
      isEditing: true,
      editingId: automation.id,
      name: automation.name,
      condition: automation.condition_value,
      conditionType: automation.condition_type,
      action: automation.payee_name,
      transactionType: "All", // Default value
      autoAdd: automation.auto_add,
    });
    // Clear any existing errors
    setPayeeModalErrors({
      name: false,
      condition: false,
      action: false,
    });
  };

  // New function to open category automation modal for editing
  const openCategoryAutomationForEdit = (automation: CategoryAutomation) => {
    setCategoryAutomationModal({
      isOpen: true,
      isEditing: true,
      editingId: automation.id,
      name: automation.name,
      condition: automation.condition_value,
      conditionType: automation.condition_type,
      action: automation.category_name,
      transactionType: "All", // Default value
      autoAdd: automation.auto_add,
    });
    // Clear any existing errors
    setCategoryModalErrors({
      name: false,
      condition: false,
      action: false,
    });
  };

  // Add function to create or update payee automation from modal
  const createOrUpdatePayeeAutomation = async () => {
    // Validate required fields
    const errors = {
      name: !payeeAutomationModal.name.trim(),
      condition: !payeeAutomationModal.condition.trim(),
      action: !payeeAutomationModal.action.trim(),
    };

    setPayeeModalErrors(errors);

    // Check if any field has errors
    if (errors.name || errors.condition || errors.action) {
      return;
    }

    if (!hasCompanyContext) {
      return;
    }

    try {
      if (payeeAutomationModal.isEditing && payeeAutomationModal.editingId) {
        // Update existing automation
        const { error } = await supabase
          .from("automations")
          .update({
            name: payeeAutomationModal.name.trim(),
            condition_type: payeeAutomationModal.conditionType,
            condition_value: payeeAutomationModal.condition.trim(),
            action_value: payeeAutomationModal.action.trim(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", payeeAutomationModal.editingId)
          .eq("company_id", currentCompany!.id)
          .eq("automation_type", "payee");

        if (error) {
          console.error("Error updating payee automation:", error);
          return;
        }

        // Update local state
        setPayeeAutomations((prev) =>
          prev.map((automation) =>
            automation.id === payeeAutomationModal.editingId
              ? {
                  ...automation,
                  name: payeeAutomationModal.name.trim(),
                  condition_type: payeeAutomationModal.conditionType,
                  condition_value: payeeAutomationModal.condition.trim(),
                  payee_name: payeeAutomationModal.action.trim(),
                }
              : automation
          )
        );
      } else {
        // Create new automation
        const { data, error } = await supabase
          .from("automations")
          .insert([
            {
              company_id: currentCompany!.id,
              name: payeeAutomationModal.name.trim(),
              automation_type: "payee",
              condition_type: payeeAutomationModal.conditionType,
              condition_value: payeeAutomationModal.condition.trim(),
              action_value: payeeAutomationModal.action.trim(),
              enabled: true,
            },
          ])
          .select()
          .single();

        if (error) {
          console.error("Error creating payee automation:", error);
          return;
        }

        // Add to local state
        const newAutomation: PayeeAutomation = {
          id: data.id,
          name: data.name,
          condition_type: data.condition_type,
          condition_value: data.condition_value,
          payee_name: data.action_value,
          company_id: data.company_id,
          enabled: data.enabled,
          auto_add: data.auto_add || false,
        };
        setPayeeAutomations((prev) => [...prev, newAutomation]);
      }

      setPayeeAutomationModal({
        isOpen: false,
        isEditing: false,
        editingId: null,
        name: "",
        condition: "",
        conditionType: "contains",
        action: "",
        transactionType: "All",
        autoAdd: false,
      });
      // Clear errors when successfully created/updated
      setPayeeModalErrors({
        name: false,
        condition: false,
        action: false,
      });
    } catch (error) {
      console.error("Error saving payee automation:", error);
    }
  };

  // Add function to create or update category automation from modal
  const createOrUpdateCategoryAutomation = async () => {
    // Validate required fields
    const errors = {
      name: !categoryAutomationModal.name.trim(),
      condition: !categoryAutomationModal.condition.trim(),
      action: !categoryAutomationModal.action.trim(),
    };

    setCategoryModalErrors(errors);

    // Check if any field has errors
    if (errors.name || errors.condition || errors.action) {
      return;
    }

    if (!hasCompanyContext) {
      return;
    }

    try {
      if (categoryAutomationModal.isEditing && categoryAutomationModal.editingId) {
        // Update existing automation
        const { error } = await supabase
          .from("automations")
          .update({
            name: categoryAutomationModal.name.trim(),
            condition_type: categoryAutomationModal.conditionType,
            condition_value: categoryAutomationModal.condition.trim(),
            action_value: categoryAutomationModal.action.trim(),
            auto_add: categoryAutomationModal.autoAdd,
            updated_at: new Date().toISOString(),
          })
          .eq("id", categoryAutomationModal.editingId)
          .eq("company_id", currentCompany!.id)
          .eq("automation_type", "category");

        if (error) {
          console.error("Error updating category automation:", error);
          return;
        }

        // Update local state
        setCategoryAutomations((prev) =>
          prev.map((automation) =>
            automation.id === categoryAutomationModal.editingId
              ? {
                  ...automation,
                  name: categoryAutomationModal.name.trim(),
                  condition_type: categoryAutomationModal.conditionType,
                  condition_value: categoryAutomationModal.condition.trim(),
                  category_name: categoryAutomationModal.action.trim(),
                  auto_add: categoryAutomationModal.autoAdd,
                }
              : automation
          )
        );
      } else {
        // Create new automation
        const { data, error } = await supabase
          .from("automations")
          .insert([
            {
              company_id: currentCompany!.id,
              name: categoryAutomationModal.name.trim(),
              automation_type: "category",
              condition_type: categoryAutomationModal.conditionType,
              condition_value: categoryAutomationModal.condition.trim(),
              action_value: categoryAutomationModal.action.trim(),
              enabled: true,
              auto_add: categoryAutomationModal.autoAdd,
            },
          ])
          .select()
          .single();

        if (error) {
          console.error("Error creating category automation:", error);
          return;
        }

        // Add to local state
        const newAutomation: CategoryAutomation = {
          id: data.id,
          name: data.name,
          condition_type: data.condition_type,
          condition_value: data.condition_value,
          category_name: data.action_value,
          company_id: data.company_id,
          enabled: data.enabled,
          auto_add: data.auto_add || false,
        };
        setCategoryAutomations((prev) => [...prev, newAutomation]);
      }

      setCategoryAutomationModal({
        isOpen: false,
        isEditing: false,
        editingId: null,
        name: "",
        condition: "",
        conditionType: "contains",
        action: "",
        transactionType: "All",
        autoAdd: false,
      });
      // Clear errors when successfully created/updated
      setCategoryModalErrors({
        name: false,
        condition: false,
        action: false,
      });
    } catch (error) {
      console.error("Error saving category automation:", error);
    }
  };

  // Download automation template
  const downloadAutomationTemplate = () => {
    const csvContent =
      "Name,Type,Condition Type,Condition Value,Action Value\nOffice Supplies Rule,payee,contains,Office Depot,Office Depot\nAdvertising Rule,category,starts_with,Google Ads,Advertising\nBank Fee Rule,category,equals,Monthly Maintenance Fee,Bank Fees";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "automations_template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Validate automation CSV
  const validateAutomationCSV = (data: Papa.ParseResult<AutomationCSVRow>) => {
    if (!data.data || data.data.length === 0) {
      return "CSV file is empty";
    }

    const requiredColumns = ["Name", "Type", "Condition Type", "Condition Value", "Action Value"];
    const headers = Object.keys(data.data[0]);

    const missingColumns = requiredColumns.filter((col) => !headers.includes(col));
    if (missingColumns.length > 0) {
      return `Missing required columns: ${missingColumns.join(", ")}. Expected: ${requiredColumns.join(", ")}`;
    }

    const nonEmptyRows = data.data.filter(
      (row) => row.Name && row.Type && row["Condition Type"] && row["Condition Value"] && row["Action Value"]
    );

    if (nonEmptyRows.length === 0) {
      return "No valid automation data found. Please ensure you have at least one row with all required fields.";
    }

    const validTypes = ["payee", "category"];
    const validConditionTypes = ["contains", "equals", "starts_with", "ends_with"];

    for (let i = 0; i < nonEmptyRows.length; i++) {
      const row = nonEmptyRows[i];

      if (!row.Name.trim()) {
        return `Empty name in row ${i + 1}. Please provide a name for each automation.`;
      }

      if (!validTypes.includes(row.Type)) {
        return `Invalid type "${row.Type}" in row ${i + 1}. Valid types are: ${validTypes.join(", ")}`;
      }

      if (!validConditionTypes.includes(row["Condition Type"])) {
        return `Invalid condition type "${row["Condition Type"]}" in row ${
          i + 1
        }. Valid condition types are: ${validConditionTypes.join(", ")}`;
      }

      if (!row["Condition Value"].trim()) {
        return `Empty condition value in row ${i + 1}. Please provide a condition value.`;
      }

      if (!row["Action Value"].trim()) {
        return `Empty action value in row ${i + 1}. Please provide an action value.`;
      }
    }

    return null;
  };

  // Validate action values against existing payees/categories
  const validateActionValues = (automations: AutomationImportData[]): AutomationImportData[] => {
    return automations.map((automation) => {
      const isValid = true;
      let validationMessage = "";
      let needsCreation = false;

      if (automation.automation_type === "payee") {
        const payeeExists = availablePayees.some(
          (payee) => payee.name.toLowerCase() === automation.action_value.toLowerCase()
        );
        if (!payeeExists) {
          needsCreation = true;
          validationMessage = `Payee "${automation.action_value}" does not exist`;
        }
      } else if (automation.automation_type === "category") {
        const categoryExists = availableCategories.some(
          (category) => category.name.toLowerCase() === automation.action_value.toLowerCase()
        );
        if (!categoryExists) {
          needsCreation = true;
          validationMessage = `Category "${automation.action_value}" does not exist`;
        }
      }

      return {
        ...automation,
        isValid,
        validationMessage,
        needsCreation,
      };
    });
  };

  // Handle automation file upload
  const handleAutomationFileUpload = (event: React.ChangeEvent<HTMLInputElement> | DragEvent) => {
    const file = event instanceof DragEvent ? event.dataTransfer?.files[0] : event.target.files?.[0];

    if (!file) return;

    setAutomationImportModal((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results: Papa.ParseResult<AutomationCSVRow>) => {
        const error = validateAutomationCSV(results);
        if (error) {
          setAutomationImportModal((prev) => ({
            ...prev,
            isLoading: false,
            error,
          }));
          return;
        }

        const automations = results.data
          .filter(
            (row: AutomationCSVRow) =>
              row.Name && row.Type && row["Condition Type"] && row["Condition Value"] && row["Action Value"]
          )
          .map((row: AutomationCSVRow) => ({
            id: uuidv4(),
            name: row.Name.trim(),
            automation_type: row.Type,
            condition_type: row["Condition Type"],
            condition_value: row["Condition Value"].trim(),
            action_value: row["Action Value"].trim(),
            company_id: currentCompany?.id,
            enabled: true,
            isValid: true,
            validationMessage: undefined,
            needsCreation: false,
          }));

        const validatedAutomations = validateActionValues(automations);

        setAutomationImportModal((prev) => ({
          ...prev,
          isLoading: false,
          csvData: validatedAutomations,
          step: "review",
        }));
      },
      error: (error) => {
        setAutomationImportModal((prev) => ({
          ...prev,
          isLoading: false,
          error: `Error parsing CSV: ${error.message}`,
        }));
      },
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleAutomationDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer?.files[0];
    if (file) {
      const event = {
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleAutomationFileUpload(event);
    }
  };

  // Create condition type options for dropdown
  const conditionTypeOptions: SelectOption[] = [
    { value: "contains", label: "Contains" },
    { value: "equals", label: "Equals" },
    { value: "starts_with", label: "Starts with" },
    { value: "ends_with", label: "Ends with" },
  ];

  // Create payee options for dropdown
  const payeeOptions: SelectOption[] = [
    { value: "", label: "Select a payee..." },
    { value: "add_new", label: "+ Add new payee" },
    ...availablePayees.map((p) => ({ value: p.name, label: p.name })),
  ];

  // Create category options for dropdown
  const categoryOptions: SelectOption[] = [
    { value: "", label: "Select a category..." },
    { value: "add_new", label: "+ Add new category" },
    ...availableCategories.map((c) => ({ value: c.name, label: c.name })),
  ];

  // Helper functions to format display text
  const formatConditionDisplay = (conditionType: string, conditionValue: string) => {
    const typeLabels: { [key: string]: string } = {
      contains: "Contains",
      equals: "Equals",
      starts_with: "Starts with",
      ends_with: "Ends with",
    };
    return `${typeLabels[conditionType] || conditionType} "${conditionValue}"`;
  };

  const formatActionDisplay = (actionType: "payee" | "category", actionValue: string) => {
    if (actionType === "payee") {
      return `Set payee to "${actionValue}"`;
    } else {
      return `Set category to "${actionValue}"`;
    }
  };

  const filteredPayeeAutomations = payeeAutomations.filter(
    (automation) =>
      automation.name.toLowerCase().includes(payeeSearch.toLowerCase()) ||
      formatConditionDisplay(automation.condition_type, automation.condition_value)
        .toLowerCase()
        .includes(payeeSearch.toLowerCase()) ||
      automation.payee_name.toLowerCase().includes(payeeSearch.toLowerCase())
  );

  const filteredCategoryAutomations = categoryAutomations.filter(
    (automation) =>
      automation.name.toLowerCase().includes(categorySearch.toLowerCase()) ||
      formatConditionDisplay(automation.condition_type, automation.condition_value)
        .toLowerCase()
        .includes(categorySearch.toLowerCase()) ||
      automation.category_name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  // Check if user has company context
  if (!hasCompanyContext) {
    return (
      <div className="p-4 bg-white text-gray-900 font-sans text-xs space-y-6">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-sm font-semibold text-yellow-800 mb-2">Company Selection Required</h3>
          <p className="text-sm text-yellow-700">
            Please select a company from the dropdown in the navigation bar to manage automations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto font-sans text-gray-900">
      <div className="flex gap-8">
        {/* Payee Automations Section - Left Side */}
        <div className="flex-1">
          <div className="flex justify-between items-center mb-4">
            <button
              onClick={() =>
                setPayeeAutomationModal({
                  ...payeeAutomationModal,
                  isOpen: true,
                })
              }
              className="text-lg font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              + New Payee Automation
            </button>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setAutomationImportModal((prev) => ({
                    ...prev,
                    isOpen: true,
                  }))
                }
                className="px-3 py-1 text-xs border border-gray-300 rounded bg-gray-100 hover:bg-gray-200"
              >
                Import
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mb-3">
            <input
              type="text"
              placeholder="Search Payee Automations..."
              value={payeeSearch}
              onChange={(e) => setPayeeSearch(e.target.value)}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
            />
          </div>

          {/* Payee Automations Table */}
          <div className="bg-white rounded shadow-sm">
            <table className="w-full border-collapse border border-gray-300 text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-1 text-center font-semibold">Name</th>
                  <th className="border p-1 text-center font-semibold">If</th>
                  <th className="border p-1 text-center font-semibold">Then</th>
                  <th className="border p-1 text-center font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayeeAutomations.length > 0 ? (
                  filteredPayeeAutomations.map((automation) => (
                    <tr key={automation.id}>
                      <td className="border p-1 text-xs">{automation.name}</td>
                      <td className="border p-1 text-xs">
                        {formatConditionDisplay(automation.condition_type, automation.condition_value)}
                      </td>
                      <td className="border p-1 text-xs">{formatActionDisplay("payee", automation.payee_name)}</td>
                      <td className="border p-1 text-xs">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => openPayeeAutomationForEdit(automation)}
                            className="text-xs hover:underline text-blue-600"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="text-center p-2 text-gray-500 text-xs">
                      No payee automations found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Category Automations Section - Right Side */}
        <div className="flex-1">
          <div className="flex justify-between items-center mb-4">
            <button
              onClick={() =>
                setCategoryAutomationModal({
                  ...categoryAutomationModal,
                  isOpen: true,
                })
              }
              className="text-lg font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              + New Category Automation
            </button>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setAutomationImportModal((prev) => ({
                    ...prev,
                    isOpen: true,
                  }))
                }
                className="px-3 py-1 text-xs border border-gray-300 rounded bg-gray-100 hover:bg-gray-200"
              >
                Import
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="mb-3">
            <input
              type="text"
              placeholder="Search Category Automations..."
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
            />
          </div>

          {/* Category Automations Table */}
          <div className="bg-white rounded shadow-sm">
            <table className="w-full border-collapse border border-gray-300 text-xs">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-1 text-center font-semibold">Name</th>
                  <th className="border p-1 text-center font-semibold">If</th>
                  <th className="border p-1 text-center font-semibold">Then</th>
                  <th className="border p-1 text-center font-semibold">Auto-Add</th>
                  <th className="border p-1 text-center font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCategoryAutomations.length > 0 ? (
                  filteredCategoryAutomations.map((automation) => (
                    <tr key={automation.id}>
                      <td className="border p-1 text-xs">{automation.name}</td>
                      <td className="border p-1 text-xs">
                        {formatConditionDisplay(automation.condition_type, automation.condition_value)}
                      </td>
                      <td className="border p-1 text-xs">
                        {formatActionDisplay("category", automation.category_name)}
                      </td>
                      <td className="border p-1 text-xs text-center">{automation.auto_add ? "✓" : ""}</td>
                      <td className="border p-1 text-xs">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => openCategoryAutomationForEdit(automation)}
                            className="text-xs hover:underline text-blue-600"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center p-2 text-gray-500 text-xs">
                      No category automations found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Payee Automation Modal */}
      {payeeAutomationModal.isOpen && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50"
          onClick={() =>
            setPayeeAutomationModal({
              isOpen: false,
              isEditing: false,
              editingId: null,
              name: "",
              condition: "",
              conditionType: "contains",
              action: "",
              transactionType: "All",
              autoAdd: false,
            })
          }
        >
          <div className="bg-white rounded-lg p-6 w-[500px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                {payeeAutomationModal.isEditing ? "Edit Payee Automation" : "Create Payee Automation"}
              </h2>
              <button
                onClick={() =>
                  setPayeeAutomationModal({
                    isOpen: false,
                    isEditing: false,
                    editingId: null,
                    name: "",
                    condition: "",
                    conditionType: "contains",
                    action: "",
                    transactionType: "All",
                    autoAdd: false,
                  })
                }
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What do you want to call this rule? *
                </label>
                <input
                  type="text"
                  value={payeeAutomationModal.name}
                  onChange={(e) => {
                    setPayeeAutomationModal((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }));
                    // Clear error when user starts typing
                    if (payeeModalErrors.name) {
                      setPayeeModalErrors((prev) => ({
                        ...prev,
                        name: false,
                      }));
                    }
                  }}
                  className={`w-full border px-2 py-1 rounded ${
                    payeeModalErrors.name ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="Enter rule name"
                />
                {payeeModalErrors.name && <p className="text-xs text-red-500 mt-1">Rule name is required</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condition Type</label>
                <Select
                  options={conditionTypeOptions}
                  value={conditionTypeOptions.find((opt) => opt.value === payeeAutomationModal.conditionType)}
                  onChange={(selectedOption) => {
                    const option = selectedOption as SelectOption | null;
                    setPayeeAutomationModal((prev) => ({
                      ...prev,
                      conditionType: option?.value || "contains",
                    }));
                  }}
                  isSearchable={false}
                  styles={{
                    control: (base) => ({
                      ...base,
                      minHeight: "32px",
                      height: "32px",
                      fontSize: "14px",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                      padding: "0 8px",
                      boxShadow: "none",
                      "&:hover": {
                        borderColor: "#d1d5db",
                      },
                    }),
                    valueContainer: (base) => ({
                      ...base,
                      padding: "0",
                    }),
                    input: (base) => ({
                      ...base,
                      margin: "0",
                      padding: "0",
                    }),
                    indicatorsContainer: (base) => ({
                      ...base,
                      height: "32px",
                    }),
                    dropdownIndicator: (base) => ({
                      ...base,
                      padding: "0 4px",
                    }),
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <input
                  type="text"
                  value={payeeAutomationModal.condition}
                  onChange={(e) => {
                    setPayeeAutomationModal((prev) => ({
                      ...prev,
                      condition: e.target.value,
                    }));
                    // Clear error when user starts typing
                    if (payeeModalErrors.condition) {
                      setPayeeModalErrors((prev) => ({
                        ...prev,
                        condition: false,
                      }));
                    }
                  }}
                  className={`w-full border px-2 py-1 rounded ${
                    payeeModalErrors.condition ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="Enter description to match"
                />
                {payeeModalErrors.condition && <p className="text-xs text-red-500 mt-1">Description is required</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Then Assign *</label>
                <Select
                  options={payeeOptions}
                  value={payeeOptions.find((opt) => opt.value === payeeAutomationModal.action) || payeeOptions[0]}
                  onChange={(selectedOption) => {
                    const option = selectedOption as SelectOption | null;
                    if (option?.value === "add_new") {
                      // TODO: Implement add new payee modal
                      alert("Add new payee functionality - would open modal to create new payee");
                    } else {
                      setPayeeAutomationModal((prev) => ({
                        ...prev,
                        action: option?.value || "",
                      }));
                      // Clear error when user selects a value
                      if (payeeModalErrors.action && option?.value) {
                        setPayeeModalErrors((prev) => ({
                          ...prev,
                          action: false,
                        }));
                      }
                    }
                  }}
                  isSearchable
                  placeholder="Select a payee..."
                  styles={{
                    control: (base) => ({
                      ...base,
                      minHeight: "32px",
                      height: "32px",
                      fontSize: "14px",
                      border: `1px solid ${payeeModalErrors.action ? "#ef4444" : "#d1d5db"}`,
                      borderRadius: "6px",
                      padding: "0 8px",
                      boxShadow: "none",
                      "&:hover": {
                        borderColor: payeeModalErrors.action ? "#ef4444" : "#d1d5db",
                      },
                    }),
                    valueContainer: (base) => ({
                      ...base,
                      padding: "0",
                    }),
                    input: (base) => ({
                      ...base,
                      margin: "0",
                      padding: "0",
                    }),
                    indicatorsContainer: (base) => ({
                      ...base,
                      height: "32px",
                    }),
                    dropdownIndicator: (base) => ({
                      ...base,
                      padding: "0 4px",
                    }),
                  }}
                />
                {payeeModalErrors.action && (
                  <p className="text-xs text-red-500 mt-1">Please select a payee to assign</p>
                )}
                {availablePayees.length === 0 && !payeeModalErrors.action && (
                  <p className="text-xs text-gray-500 mt-1">
                    No payees available. Create payees in the Categories page first.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center mt-6">
              {payeeAutomationModal.isEditing && payeeAutomationModal.editingId && (
                <button
                  onClick={() => {
                    if (
                      payeeAutomationModal.editingId &&
                      window.confirm("Are you sure you want to delete this automation? This action cannot be undone.")
                    ) {
                      handleDeletePayeeAutomation(payeeAutomationModal.editingId);
                      setPayeeAutomationModal({
                        isOpen: false,
                        isEditing: false,
                        editingId: null,
                        name: "",
                        condition: "",
                        conditionType: "contains",
                        action: "",
                        transactionType: "All",
                        autoAdd: false,
                      });
                    }
                  }}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Delete
                </button>
              )}
              <div className="flex gap-2">
                <button
                  onClick={createOrUpdatePayeeAutomation}
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
                >
                  {payeeAutomationModal.isEditing ? "Save" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Automation Modal */}
      {categoryAutomationModal.isOpen && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50"
          onClick={() =>
            setCategoryAutomationModal({
              isOpen: false,
              isEditing: false,
              editingId: null,
              name: "",
              condition: "",
              conditionType: "contains",
              action: "",
              transactionType: "All",
              autoAdd: false,
            })
          }
        >
          <div className="bg-white rounded-lg p-6 w-[500px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                {categoryAutomationModal.isEditing ? "Edit Category Automation" : "Create Category Automation"}
              </h2>
              <button
                onClick={() =>
                  setCategoryAutomationModal({
                    isOpen: false,
                    isEditing: false,
                    editingId: null,
                    name: "",
                    condition: "",
                    conditionType: "contains",
                    action: "",
                    transactionType: "All",
                    autoAdd: false,
                  })
                }
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  What do you want to call this rule? *
                </label>
                <input
                  type="text"
                  value={categoryAutomationModal.name}
                  onChange={(e) => {
                    setCategoryAutomationModal((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }));
                    // Clear error when user starts typing
                    if (categoryModalErrors.name) {
                      setCategoryModalErrors((prev) => ({
                        ...prev,
                        name: false,
                      }));
                    }
                  }}
                  className={`w-full border px-2 py-1 rounded ${
                    categoryModalErrors.name ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="Enter rule name"
                />
                {categoryModalErrors.name && <p className="text-xs text-red-500 mt-1">Rule name is required</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Condition Type</label>
                <Select
                  options={conditionTypeOptions}
                  value={conditionTypeOptions.find((opt) => opt.value === categoryAutomationModal.conditionType)}
                  onChange={(selectedOption) => {
                    const option = selectedOption as SelectOption | null;
                    setCategoryAutomationModal((prev) => ({
                      ...prev,
                      conditionType: option?.value || "contains",
                    }));
                  }}
                  isSearchable={false}
                  styles={{
                    control: (base) => ({
                      ...base,
                      minHeight: "32px",
                      height: "32px",
                      fontSize: "14px",
                      border: "1px solid #d1d5db",
                      borderRadius: "6px",
                      padding: "0 8px",
                      boxShadow: "none",
                      "&:hover": {
                        borderColor: "#d1d5db",
                      },
                    }),
                    valueContainer: (base) => ({
                      ...base,
                      padding: "0",
                    }),
                    input: (base) => ({
                      ...base,
                      margin: "0",
                      padding: "0",
                    }),
                    indicatorsContainer: (base) => ({
                      ...base,
                      height: "32px",
                    }),
                    dropdownIndicator: (base) => ({
                      ...base,
                      padding: "0 4px",
                    }),
                  }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <input
                  type="text"
                  value={categoryAutomationModal.condition}
                  onChange={(e) => {
                    setCategoryAutomationModal((prev) => ({
                      ...prev,
                      condition: e.target.value,
                    }));
                    // Clear error when user starts typing
                    if (categoryModalErrors.condition) {
                      setCategoryModalErrors((prev) => ({
                        ...prev,
                        condition: false,
                      }));
                    }
                  }}
                  className={`w-full border px-2 py-1 rounded ${
                    categoryModalErrors.condition ? "border-red-500" : "border-gray-300"
                  }`}
                  placeholder="Enter description to match"
                />
                {categoryModalErrors.condition && <p className="text-xs text-red-500 mt-1">Description is required</p>}
              </div>

              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={categoryAutomationModal.autoAdd}
                    onChange={(e) => {
                      setCategoryAutomationModal((prev) => ({
                        ...prev,
                        autoAdd: e.target.checked,
                      }));
                    }}
                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Automatically add to Added table when category is set
                  </span>
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  When enabled, transactions matching this automation will be automatically moved from &quot;To
                  Add&quot; to &quot;Added&quot; since a category is required for adding transactions.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Then Assign *</label>
                <Select
                  options={categoryOptions}
                  value={
                    categoryOptions.find((opt) => opt.value === categoryAutomationModal.action) || categoryOptions[0]
                  }
                  onChange={(selectedOption) => {
                    const option = selectedOption as SelectOption | null;
                    if (option?.value === "add_new") {
                      // TODO: Implement add new category modal
                      alert("Add new category functionality - would open modal to create new category");
                    } else {
                      setCategoryAutomationModal((prev) => ({
                        ...prev,
                        action: option?.value || "",
                      }));
                      // Clear error when user selects a value
                      if (categoryModalErrors.action && option?.value) {
                        setCategoryModalErrors((prev) => ({
                          ...prev,
                          action: false,
                        }));
                      }
                    }
                  }}
                  isSearchable
                  placeholder="Select a category..."
                  styles={{
                    control: (base) => ({
                      ...base,
                      minHeight: "32px",
                      height: "32px",
                      fontSize: "14px",
                      border: `1px solid ${categoryModalErrors.action ? "#ef4444" : "#d1d5db"}`,
                      borderRadius: "6px",
                      padding: "0 8px",
                      boxShadow: "none",
                      "&:hover": {
                        borderColor: categoryModalErrors.action ? "#ef4444" : "#d1d5db",
                      },
                    }),
                    valueContainer: (base) => ({
                      ...base,
                      padding: "0",
                    }),
                    input: (base) => ({
                      ...base,
                      margin: "0",
                      padding: "0",
                    }),
                    indicatorsContainer: (base) => ({
                      ...base,
                      height: "32px",
                    }),
                    dropdownIndicator: (base) => ({
                      ...base,
                      padding: "0 4px",
                    }),
                  }}
                />
                {categoryModalErrors.action && (
                  <p className="text-xs text-red-500 mt-1">Please select a category to assign</p>
                )}
                {availableCategories.length === 0 && !categoryModalErrors.action && (
                  <p className="text-xs text-gray-500 mt-1">
                    No categories available. Create categories in the Categories page first.
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center mt-6">
              {categoryAutomationModal.isEditing && categoryAutomationModal.editingId && (
                <button
                  onClick={() => {
                    if (
                      categoryAutomationModal.editingId &&
                      window.confirm("Are you sure you want to delete this automation? This action cannot be undone.")
                    ) {
                      handleDeleteCategoryAutomation(categoryAutomationModal.editingId);
                      setCategoryAutomationModal({
                        isOpen: false,
                        isEditing: false,
                        editingId: null,
                        name: "",
                        condition: "",
                        conditionType: "contains",
                        action: "",
                        transactionType: "All",
                        autoAdd: false,
                      });
                    }
                  }}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Delete
                </button>
              )}
              <div className="flex gap-2">
                <button
                  onClick={createOrUpdateCategoryAutomation}
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
                >
                  {categoryAutomationModal.isEditing ? "Save" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Automation Import Modal */}
      {automationImportModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50">
          <div className="bg-white rounded-lg p-6 w-[600px] overflow-y-auto shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Import Automations</h2>
              <button
                onClick={() =>
                  setAutomationImportModal((prev) => ({
                    ...prev,
                    isOpen: false,
                  }))
                }
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {automationImportModal.error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4">
                {automationImportModal.error}
              </div>
            )}

            {automationImportModal.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : (
              <div className="space-y-1">
                {automationImportModal.step === "upload" && (
                  <>
                    <div className="space-y-4">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <h3 className="text-sm font-medium text-gray-700">Upload CSV File</h3>
                          <button
                            onClick={downloadAutomationTemplate}
                            className="text-sm text-gray-600 hover:text-gray-800"
                          >
                            Download Template
                          </button>
                        </div>

                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <h4 className="text-sm font-medium text-blue-800 mb-2">CSV Format Instructions:</h4>
                          <ul className="text-sm text-blue-700 space-y-1">
                            <li>
                              • <strong>Name:</strong> Automation rule name (required)
                            </li>
                            <li>
                              • <strong>Type:</strong> Either &quot;payee&quot; or &quot;category&quot; (required)
                            </li>
                            <li>
                              • <strong>Condition Type:</strong> One of: contains, equals, starts_with, ends_with
                              (required)
                            </li>
                            <li>
                              • <strong>Condition Value:</strong> Text to match in transaction description (required)
                            </li>
                            <li>
                              • <strong>Action Value:</strong> Payee name or category name to assign (required)
                            </li>
                          </ul>
                        </div>
                      </div>
                      <div
                        className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center transition-colors duration-200 hover:border-gray-400"
                        onDragOver={handleDragOver}
                        onDrop={handleAutomationDrop}
                      >
                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleAutomationFileUpload}
                          className="hidden"
                          id="automation-csv-upload"
                        />
                        <label
                          htmlFor="automation-csv-upload"
                          className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                        >
                          Choose CSV File
                        </label>
                        <p className="mt-2 text-sm text-gray-500">
                          Drag and drop your CSV file here, or click to browse
                        </p>
                      </div>
                    </div>
                    <div className="flex justify-end space-x-2 mt-4">
                      <button
                        onClick={() =>
                          setAutomationImportModal((prev) => ({
                            ...prev,
                            isOpen: false,
                          }))
                        }
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
                {automationImportModal.step === "review" && (
                  <>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h3 className="text-sm font-medium text-gray-700">Review Automations</h3>
                      </div>

                      {/* Missing items warning and options */}
                      {automationImportModal.csvData.some((auto) => auto.needsCreation) && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <h4 className="text-sm font-medium text-yellow-800 mb-2">Missing References Detected</h4>
                          <p className="text-sm text-yellow-700 mb-3">
                            Some automations reference payees or categories that don&apos;t exist in your system.
                          </p>
                          <label className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              checked={automationImportModal.autoCreateMissing}
                              onChange={(e) =>
                                setAutomationImportModal((prev) => ({
                                  ...prev,
                                  autoCreateMissing: e.target.checked,
                                }))
                              }
                              className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                            />
                            <span className="text-sm text-yellow-700">
                              Automatically create missing payees and categories during import
                            </span>
                          </label>
                        </div>
                      )}
                      <div className="border rounded-lg overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                                <input
                                  type="checkbox"
                                  checked={
                                    automationImportModal.csvData.length > 0 &&
                                    automationImportModal.selectedAutomations.size ===
                                      automationImportModal.csvData.length
                                  }
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setAutomationImportModal((prev) => ({
                                        ...prev,
                                        selectedAutomations: new Set(
                                          automationImportModal.csvData.map((auto) => auto.id)
                                        ),
                                      }));
                                    } else {
                                      setAutomationImportModal((prev) => ({
                                        ...prev,
                                        selectedAutomations: new Set(),
                                      }));
                                    }
                                  }}
                                  className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                />
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Name
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Type
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Condition
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Action
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {automationImportModal.csvData.map((automation) => (
                              <tr
                                key={automation.id}
                                className={`${
                                  automation.needsCreation && !automationImportModal.autoCreateMissing
                                    ? "bg-yellow-50"
                                    : ""
                                }`}
                              >
                                <td className="px-4 py-2 whitespace-nowrap w-8 text-left">
                                  <input
                                    type="checkbox"
                                    checked={automationImportModal.selectedAutomations.has(automation.id)}
                                    onChange={(e) => {
                                      const newSelected = new Set(automationImportModal.selectedAutomations);
                                      if (e.target.checked) {
                                        newSelected.add(automation.id);
                                      } else {
                                        newSelected.delete(automation.id);
                                      }
                                      setAutomationImportModal((prev) => ({
                                        ...prev,
                                        selectedAutomations: newSelected,
                                      }));
                                    }}
                                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                  />
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900">{automation.name}</td>
                                <td className="px-4 py-2 text-sm text-gray-900">{automation.automation_type}</td>
                                <td className="px-4 py-2 text-sm text-gray-900">
                                  {formatConditionDisplay(automation.condition_type, automation.condition_value)}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900">
                                  {formatActionDisplay(
                                    automation.automation_type as "payee" | "category",
                                    automation.action_value
                                  )}
                                </td>
                                <td className="px-4 py-2 text-sm">
                                  {automation.needsCreation ? (
                                    automationImportModal.autoCreateMissing ? (
                                      <div className="flex items-center space-x-1">
                                        <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                                        <span className="text-blue-700 text-xs">
                                          Will create {automation.automation_type}
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center space-x-1">
                                        <span className="w-2 h-2 bg-red-400 rounded-full"></span>
                                        <span className="text-red-700 text-xs">Will be skipped</span>
                                      </div>
                                    )
                                  ) : (
                                    <div className="flex items-center space-x-1">
                                      <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                                      <span className="text-green-700 text-xs">Valid</span>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="text-sm font-medium">
                        {automationImportModal.selectedAutomations.size > 0 && (
                          <>
                            <span className="text-gray-600">
                              {automationImportModal.selectedAutomations.size} selected
                            </span>
                            {!automationImportModal.autoCreateMissing &&
                              (() => {
                                const selectedAutomations = automationImportModal.csvData.filter((auto) =>
                                  automationImportModal.selectedAutomations.has(auto.id)
                                );
                                const validCount = selectedAutomations.filter((auto) => !auto.needsCreation).length;
                                const invalidCount = selectedAutomations.filter((auto) => auto.needsCreation).length;

                                return invalidCount > 0 ? (
                                  <span className="text-red-600 ml-2">
                                    ({validCount} will import, {invalidCount} will skip)
                                  </span>
                                ) : null;
                              })()}
                          </>
                        )}
                      </div>
                      <div className="flex justify-end space-x-2 mt-4">
                        <button
                          onClick={() =>
                            setAutomationImportModal((prev) => ({
                              ...prev,
                              step: "upload",
                            }))
                          }
                          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                        >
                          Back
                        </button>
                        <button
                          onClick={async () => {
                            setAutomationImportModal((prev) => ({
                              ...prev,
                              isLoading: true,
                              error: null,
                            }));
                            try {
                              if (!currentCompany) {
                                throw new Error("No company selected. Please select a company first.");
                              }

                              const selectedAutomations = automationImportModal.csvData.filter((auto) =>
                                automationImportModal.selectedAutomations.has(auto.id)
                              );

                              if (selectedAutomations.length === 0) {
                                throw new Error("No automations selected for import.");
                              }

                              // If auto-create is enabled, create missing payees and categories first
                              if (automationImportModal.autoCreateMissing) {
                                const missingPayees = new Set<string>();
                                const missingCategories = new Set<string>();

                                selectedAutomations.forEach((auto) => {
                                  if (auto.needsCreation) {
                                    if (auto.automation_type === "payee") {
                                      missingPayees.add(auto.action_value);
                                    } else if (auto.automation_type === "category") {
                                      missingCategories.add(auto.action_value);
                                    }
                                  }
                                });

                                // Create missing payees
                                if (missingPayees.size > 0) {
                                  const payeesToCreate = Array.from(missingPayees).map((name) => ({
                                    name,
                                    company_id: currentCompany.id,
                                  }));

                                  const { error: payeeError } = await supabase.from("payees").insert(payeesToCreate);

                                  if (payeeError) {
                                    throw new Error(`Failed to create payees: ${payeeError.message}`);
                                  }
                                }

                                // Create missing categories as Expense type by default
                                if (missingCategories.size > 0) {
                                  const categoriesToCreate = Array.from(missingCategories).map((name) => ({
                                    name,
                                    type: "Expense", // Default to Expense type
                                    company_id: currentCompany.id,
                                  }));

                                  const { error: categoryError } = await supabase
                                    .from("chart_of_accounts")
                                    .insert(categoriesToCreate);

                                  if (categoryError) {
                                    throw new Error(`Failed to create categories: ${categoryError.message}`);
                                  }
                                }
                              } else {
                                // If not auto-creating, check if there are invalid automations selected
                                const validAutomations = selectedAutomations.filter((auto) => !auto.needsCreation);
                                const invalidAutomations = selectedAutomations.filter((auto) => auto.needsCreation);

                                if (invalidAutomations.length > 0 && validAutomations.length > 0) {
                                  // Mixed selection - show confirmation
                                  const proceed = window.confirm(
                                    `${invalidAutomations.length} selected automation(s) reference missing payees/categories and will be skipped.\n\n` +
                                      `Only ${validAutomations.length} valid automation(s) will be imported.\n\n` +
                                      `Click OK to proceed with valid automations only, or Cancel to go back and enable auto-creation.`
                                  );

                                  if (!proceed) {
                                    // User cancelled, stop the import process
                                    setAutomationImportModal((prev) => ({
                                      ...prev,
                                      isLoading: false,
                                    }));
                                    return;
                                  }
                                } else if (validAutomations.length === 0) {
                                  // All selected automations are invalid
                                  throw new Error(
                                    "All selected automations reference missing payees/categories. Enable 'Auto-create missing items' or select only valid automations."
                                  );
                                }

                                // Update selectedAutomations to only include valid ones
                                selectedAutomations.splice(0, selectedAutomations.length, ...validAutomations);
                              }

                              const automationsToInsert = selectedAutomations.map((auto) => ({
                                name: auto.name,
                                automation_type: auto.automation_type,
                                condition_type: auto.condition_type,
                                condition_value: auto.condition_value,
                                action_value: auto.action_value,
                                enabled: auto.enabled,
                                company_id: currentCompany.id,
                              }));

                              const { error } = await supabase.from("automations").insert(automationsToInsert);

                              if (error) {
                                throw new Error(error.message);
                              }

                              setAutomationImportModal({
                                isOpen: false,
                                step: "upload",
                                csvData: [],
                                isLoading: false,
                                error: null,
                                selectedAutomations: new Set(),
                                autoCreateMissing: false,
                              });

                              // Refresh the automations lists
                              fetchPayeeAutomations();
                              fetchCategoryAutomations();
                            } catch (error) {
                              setAutomationImportModal((prev) => ({
                                ...prev,
                                isLoading: false,
                                error:
                                  error instanceof Error
                                    ? error.message
                                    : "Failed to import automations. Please try again.",
                              }));
                            }
                          }}
                          className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
                        >
                          Import
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
