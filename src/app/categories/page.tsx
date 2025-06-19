"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useApiWithCompany } from "@/hooks/useApiWithCompany";
import Papa from "papaparse";
import { v4 as uuidv4 } from "uuid";
import { X } from "lucide-react";

const ACCOUNT_TYPES = [
    "Asset",
    "Liability",
    "Equity",
    "Revenue",
    "COGS",
    "Expense",
];

type Category = {
    id: string;
    name: string;
    type: string;
    subtype?: string;
    parent_id?: string | null;
};

type Payee = {
    id: string;
    name: string;
    company_id: string;
};

type CategoryImportModalState = {
    isOpen: boolean;
    step: "upload" | "review";
    csvData: Category[];
    isLoading: boolean;
    error: string | null;
    selectedCategories: Set<string>;
};

type PayeeImportModalState = {
    isOpen: boolean;
    step: "upload" | "review";
    csvData: Payee[];
    isLoading: boolean;
    error: string | null;
    selectedPayees: Set<string>;
};

type CategoryCSVRow = {
    Name: string;
    Type: string;
    "Parent Category"?: string;
};

type PayeeCSVRow = {
    Name: string;
};

type SortConfig = {
    key: "name" | "type" | "parent" | null;
    direction: "asc" | "desc";
};

type PayeeSortConfig = {
    key: "name" | null;
    direction: "asc" | "desc";
};

export default function ChartOfAccountsPage() {
    const { hasCompanyContext, currentCompany } = useApiWithCompany();
    const [accounts, setAccounts] = useState<Category[]>([]);
    const [payees, setPayees] = useState<Payee[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [payeeSearch, setPayeeSearch] = useState("");
    const categoriesTableRef = useRef<HTMLDivElement>(null);

    // Add new account state
    const [newName, setNewName] = useState("");
    const [newType, setNewType] = useState("");
    const [parentId, setParentId] = useState<string | null>(null);
    const [parentOptions, setParentOptions] = useState<Category[]>([]);

    // Add new payee state
    const [newPayeeName, setNewPayeeName] = useState("");

    // Edit state
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editType, setEditType] = useState("");
    const [editParentId, setEditParentId] = useState<string | null>(null);

    // Payee edit state
    const [editingPayeeId, setEditingPayeeId] = useState<string | null>(null);
    const [editPayeeName, setEditPayeeName] = useState("");

    // Import modal state
    const [categoryImportModal, setCategoryImportModal] =
        useState<CategoryImportModalState>({
            isOpen: false,
            step: "upload",
            csvData: [],
            isLoading: false,
            error: null,
            selectedCategories: new Set(),
        });

    const [payeeImportModal, setPayeeImportModal] =
        useState<PayeeImportModalState>({
            isOpen: false,
            step: "upload",
            csvData: [],
            isLoading: false,
            error: null,
            selectedPayees: new Set(),
        });

    // Sorting state
    const [categorySortConfig, setCategorySortConfig] = useState<SortConfig>({
        key: null,
        direction: "asc",
    });
    const [payeeSortConfig, setPayeeSortConfig] = useState<PayeeSortConfig>({
        key: null,
        direction: "asc",
    });

    useEffect(() => {
        fetchAccounts();
        fetchParentOptions();
        fetchPayees();
    }, [currentCompany?.id, hasCompanyContext]);

    // Sorting functions
    const sortCategories = (categories: Category[], sortConfig: SortConfig) => {
        if (!sortConfig.key) return categories;

        return [...categories].sort((a, b) => {
            if (sortConfig.key === "name") {
                return sortConfig.direction === "asc"
                    ? a.name.localeCompare(b.name)
                    : b.name.localeCompare(a.name);
            }
            if (sortConfig.key === "type") {
                return sortConfig.direction === "asc"
                    ? a.type.localeCompare(b.type)
                    : b.type.localeCompare(a.type);
            }
            if (sortConfig.key === "parent") {
                const aParent = a.parent_id
                    ? accounts.find((acc) => acc.id === a.parent_id)?.name || ""
                    : "";
                const bParent = b.parent_id
                    ? accounts.find((acc) => acc.id === b.parent_id)?.name || ""
                    : "";
                return sortConfig.direction === "asc"
                    ? aParent.localeCompare(bParent)
                    : bParent.localeCompare(aParent);
            }
            return 0;
        });
    };

    const sortPayees = (payees: Payee[], sortConfig: PayeeSortConfig) => {
        if (!sortConfig.key) return payees;

        return [...payees].sort((a, b) => {
            if (sortConfig.key === "name") {
                return sortConfig.direction === "asc"
                    ? a.name.localeCompare(b.name)
                    : b.name.localeCompare(a.name);
            }
            return 0;
        });
    };

    const handleCategorySort = (key: "name" | "type" | "parent") => {
        setCategorySortConfig((current) => ({
            key,
            direction:
                current.key === key && current.direction === "asc"
                    ? "desc"
                    : "asc",
        }));
    };

    const handlePayeeSort = (key: "name") => {
        setPayeeSortConfig((current) => ({
            key,
            direction:
                current.key === key && current.direction === "asc"
                    ? "desc"
                    : "asc",
        }));
    };

    const fetchAccounts = async () => {
        if (!hasCompanyContext) return;

        setLoading(true);
        const { data, error } = await supabase
            .from("chart_of_accounts")
            .select("*")
            .eq("company_id", currentCompany!.id)
            .order("parent_id", { ascending: true, nullsFirst: true })
            .order("type", { ascending: true })
            .order("name", { ascending: true });
        if (!error && data) setAccounts(data);
        setLoading(false);
    };

    const fetchParentOptions = async () => {
        if (!hasCompanyContext) return;

        const { data } = await supabase
            .from("chart_of_accounts")
            .select("id, name, type")
            .eq("company_id", currentCompany!.id)
            .is("parent_id", null);
        if (data) setParentOptions(data);
    };

    const fetchPayees = async () => {
        if (!hasCompanyContext) return;

        const { data, error } = await supabase
            .from("payees")
            .select("*")
            .eq("company_id", currentCompany!.id)
            .order("name");
        if (!error && data) setPayees(data);
    };

    const filteredAccounts = sortCategories(
        accounts.filter((account) => {
            const searchLower = search.toLowerCase();
            const matchesName = account.name
                .toLowerCase()
                .includes(searchLower);
            const matchesType = account.type
                .toLowerCase()
                .includes(searchLower);

            // If this account matches the search, include it
            if (matchesName || matchesType) return true;

            // If this is a parent account, check if any of its children match
            if (account.parent_id === null) {
                const hasMatchingChild = accounts.some(
                    (child) =>
                        child.parent_id === account.id &&
                        (child.name.toLowerCase().includes(searchLower) ||
                            child.type.toLowerCase().includes(searchLower))
                );
                return hasMatchingChild;
            }

            return false;
        }),
        categorySortConfig
    );

    const filteredPayees = sortPayees(
        payees.filter((payee) =>
            payee.name.toLowerCase().includes(payeeSearch.toLowerCase())
        ),
        payeeSortConfig
    );

    const handleAddAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName || !newType || !hasCompanyContext) return;
        const { error } = await supabase.from("chart_of_accounts").insert([
            {
                name: newName,
                type: newType,
                parent_id: parentId || null,
                company_id: currentCompany!.id,
            },
        ]);
        if (!error) {
            setNewName("");
            setNewType("");
            setParentId(null);
            fetchAccounts();
            fetchParentOptions();
        }
    };

    const handleAddPayee = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPayeeName || !hasCompanyContext) return;
        const { error } = await supabase.from("payees").insert([
            {
                name: newPayeeName,
                company_id: currentCompany!.id,
            },
        ]);
        if (!error) {
            setNewPayeeName("");
            fetchPayees();
        }
    };

    const handleDelete = async (id: string) => {
        // First check if this is a parent category
        const { data: subcategories } = await supabase
            .from("chart_of_accounts")
            .select("id")
            .eq("parent_id", id);

        if (subcategories && subcategories.length > 0) {
            // This is a parent category, check if any subcategories have transactions
            const subcategoryIds = subcategories.map((sub) => sub.id);
            const { data: transactions, error: txError } = await supabase
                .from("transactions")
                .select("id")
                .or(
                    `selected_category_id.in.(${subcategoryIds.join(
                        ","
                    )}),corresponding_category_id.in.(${subcategoryIds.join(
                        ","
                    )})`
                )
                .limit(1);

            if (txError) {
                console.error("Error checking transactions:", txError);
                return;
            }

            if (transactions && transactions.length > 0) {
                alert(
                    "This category cannot be deleted because it contains subcategories that are used in existing transactions. Please reassign or delete the transactions first."
                );
                return;
            }
        } else {
            // This is a regular category, check if it has transactions
            const { data: transactions, error: txError } = await supabase
                .from("transactions")
                .select("id")
                .or(
                    `selected_category_id.eq.${id},corresponding_category_id.eq.${id}`
                )
                .limit(1);

            if (txError) {
                console.error("Error checking transactions:", txError);
                return;
            }

            if (transactions && transactions.length > 0) {
                alert(
                    "This category cannot be deleted because it is used in existing transactions. Please reassign or delete the transactions first."
                );
                return;
            }
        }

        const { error } = await supabase
            .from("chart_of_accounts")
            .delete()
            .eq("id", id);
        if (!error) {
            setEditingId(null);
            fetchAccounts();
            fetchParentOptions();
        }
    };

    const handleDeletePayee = async (id: string) => {
        // Check if payee is used in transactions
        const { data: transactions, error: txError } = await supabase
            .from("transactions")
            .select("id")
            .eq("payee_id", id)
            .limit(1);

        if (txError) {
            console.error("Error checking transactions:", txError);
            return;
        }

        if (transactions && transactions.length > 0) {
            alert(
                "This payee cannot be deleted because it is used in existing transactions. Please reassign or delete the transactions first."
            );
            return;
        }

        const { error } = await supabase.from("payees").delete().eq("id", id);
        if (!error) {
            setEditingPayeeId(null);
            fetchPayees();
        }
    };

    const handleEdit = (account: Category) => {
        setEditingId(account.id);
        setEditName(account.name);
        setEditType(account.type);
        setEditParentId(account.parent_id || null);
    };

    const handleEditPayee = (payee: Payee) => {
        setEditingPayeeId(payee.id);
        setEditPayeeName(payee.name);
    };

    const handleUpdate = async () => {
        if (!editingId) return;

        // Get current values directly from the DOM to ensure we have the latest values
        const getCurrentValues = () => {
            if (!categoriesTableRef.current)
                return { editName, editType, editParentId };

            const nameInput = categoriesTableRef.current.querySelector(
                'input[type="text"]'
            ) as HTMLInputElement;
            const typeSelect = categoriesTableRef.current.querySelector(
                "select"
            ) as HTMLSelectElement;
            const parentSelects = categoriesTableRef.current.querySelectorAll(
                "select"
            ) as NodeListOf<HTMLSelectElement>;
            const parentSelect = parentSelects[1]; // Second select is parent category

            const name = nameInput?.value || editName;
            const type = typeSelect?.value || editType;
            let parent_id = parentSelect?.value || editParentId || null;

            // Validate parent type matches category type - if not, clear parent
            if (parent_id) {
                const parentCategory = parentOptions.find(
                    (opt) => opt.id === parent_id
                );
                if (parentCategory && parentCategory.type !== type) {
                    console.log(
                        `Clearing parent ${parentCategory.name} (${parentCategory.type}) because it doesn't match category type ${type}`
                    );
                    parent_id = null;
                }
            }

            return {
                name,
                type,
                parent_id: parent_id === "" ? null : parent_id,
            };
        };

        const currentValues = getCurrentValues();

        console.log("Saving changes:", {
            currentValues,
            editingId,
            currentCompany,
        });

        try {
            // First get the current chart_of_accounts record to check if it has a plaid_account_id
            const { data: currentAccount, error: fetchError } = await supabase
                .from("chart_of_accounts")
                .select("plaid_account_id")
                .eq("id", editingId)
                .single();

            if (fetchError) {
                console.error("Error fetching current account:", fetchError);
                alert("Error fetching account data. Please try again.");
                return;
            }

            // Update chart_of_accounts
            const { error } = await supabase
                .from("chart_of_accounts")
                .update({
                    name: currentValues.name,
                    type: currentValues.type,
                    parent_id:
                        currentValues.parent_id === ""
                            ? null
                            : currentValues.parent_id,
                })
                .eq("id", editingId);

            if (error) {
                console.error("Error updating chart of accounts:", error);
                alert("Error saving changes. Please try again.");
                return;
            }

            console.log("Successfully updated chart of accounts");

            // If this chart of accounts entry is linked to a plaid account, also update the accounts table
            if (currentAccount?.plaid_account_id) {
                const { error: accountsError } = await supabase
                    .from("accounts")
                    .update({
                        name: currentValues.name,
                        type: currentValues.type,
                    })
                    .eq("plaid_account_id", currentAccount.plaid_account_id)
                    .eq("company_id", currentCompany!.id);

                if (accountsError) {
                    console.error(
                        "Error updating accounts table:",
                        accountsError
                    );
                    // Don't return here as the main update succeeded
                }
            }

            setEditingId(null);
            await fetchAccounts();
            await fetchParentOptions();
            console.log("Update completed successfully");
        } catch (error) {
            console.error("Unexpected error during update:", error);
            alert("An unexpected error occurred. Please try again.");
        }
    };

    // Handle clicks outside the table or on other rows to save changes
    useEffect(() => {
        const handleClickToSave = (event: MouseEvent) => {
            if (!editingId || !categoriesTableRef.current) return;

            const target = event.target as Node;

            // If click is outside the table, save
            if (!categoriesTableRef.current.contains(target)) {
                handleUpdate();
                return;
            }

            // If click is inside the table, check if it's on a different row
            const clickedRow = (target as Element).closest("tr");
            if (clickedRow) {
                // Get all the input/select elements in the currently editing row
                const editingInputs =
                    categoriesTableRef.current.querySelectorAll(
                        `tr input[type="text"], tr select`
                    );

                // Check if the clicked element is one of the editing inputs
                const isClickOnCurrentEditingElement = Array.from(
                    editingInputs
                ).some((input) => input.contains(target) || input === target);

                // If not clicking on the current editing elements, save
                if (!isClickOnCurrentEditingElement) {
                    handleUpdate();
                }
            }
        };

        document.addEventListener("mousedown", handleClickToSave);
        return () => {
            document.removeEventListener("mousedown", handleClickToSave);
        };
    }, [editingId]);

    const handleUpdatePayee = async () => {
        if (!editingPayeeId) return;

        const { error } = await supabase
            .from("payees")
            .update({
                name: editPayeeName,
            })
            .eq("id", editingPayeeId);

        if (!error) {
            setEditingPayeeId(null);
            fetchPayees();
        }
    };

    const downloadCategoriesTemplate = () => {
        const csvContent =
            "Name,Type,Parent Category\nOffice Supplies,Expense,\nBank Fees,Expense,\nAdvertising,Expense,\nCash,Asset,\nAccounts Receivable,Asset,\nSales Revenue,Revenue,\nService Revenue,Revenue,";
        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "categories_template.csv";
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const downloadPayeesTemplate = () => {
        const csvContent = "Name\nVendor 1\nVendor 2\nClient 1\nClient 2";
        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "payees_template.csv";
        a.click();
        window.URL.revokeObjectURL(url);
    };

    // Import validation functions
    const validateCategoryCSV = (data: Papa.ParseResult<CategoryCSVRow>) => {
        if (!data.data || data.data.length === 0) {
            return "CSV file is empty";
        }

        const requiredColumns = ["Name", "Type"];
        const headers = Object.keys(data.data[0]);

        const missingColumns = requiredColumns.filter(
            (col) => !headers.includes(col)
        );
        if (missingColumns.length > 0) {
            return `Missing required columns: ${missingColumns.join(
                ", "
            )}. Expected: Name, Type, Parent Category (optional)`;
        }

        const nonEmptyRows = data.data.filter((row) => row.Name && row.Type);

        if (nonEmptyRows.length === 0) {
            return "No valid category data found. Please ensure you have at least one row with Name and Type.";
        }

        for (let i = 0; i < nonEmptyRows.length; i++) {
            const row = nonEmptyRows[i];

            if (!row.Name.trim()) {
                return `Empty name in row ${
                    i + 1
                }. Please provide a name for each category.`;
            }

            if (!ACCOUNT_TYPES.includes(row.Type)) {
                return `Invalid type "${row.Type}" in row ${
                    i + 1
                }. Valid types are: ${ACCOUNT_TYPES.join(", ")}`;
            }
        }

        return null;
    };

    const validatePayeeCSV = (data: Papa.ParseResult<PayeeCSVRow>) => {
        if (!data.data || data.data.length === 0) {
            return "CSV file is empty";
        }

        const requiredColumns = ["Name"];
        const headers = Object.keys(data.data[0]);

        const missingColumns = requiredColumns.filter(
            (col) => !headers.includes(col)
        );
        if (missingColumns.length > 0) {
            return `Missing required columns: ${missingColumns.join(
                ", "
            )}. Expected: Name`;
        }

        const nonEmptyRows = data.data.filter((row) => row.Name);

        if (nonEmptyRows.length === 0) {
            return "No valid payee data found. Please ensure you have at least one row with Name.";
        }

        for (let i = 0; i < nonEmptyRows.length; i++) {
            const row = nonEmptyRows[i];

            if (!row.Name.trim()) {
                return `Empty name in row ${
                    i + 1
                }. Please provide a name for each payee.`;
            }
        }

        return null;
    };

    // Import file handling functions
    const handleCategoryFileUpload = (
        event: React.ChangeEvent<HTMLInputElement> | DragEvent
    ) => {
        const file =
            event instanceof DragEvent
                ? event.dataTransfer?.files[0]
                : event.target.files?.[0];

        if (!file) return;

        setCategoryImportModal((prev) => ({
            ...prev,
            isLoading: true,
            error: null,
        }));

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results: Papa.ParseResult<CategoryCSVRow>) => {
                const error = validateCategoryCSV(results);
                if (error) {
                    setCategoryImportModal((prev) => ({
                        ...prev,
                        isLoading: false,
                        error,
                    }));
                    return;
                }

                const categories = results.data
                    .filter((row: CategoryCSVRow) => row.Name && row.Type)
                    .map((row: CategoryCSVRow) => {
                        const parentCategory = row["Parent Category"]
                            ? accounts.find(
                                  (acc) => acc.name === row["Parent Category"]
                              )
                            : null;

                        return {
                            id: uuidv4(),
                            name: row.Name.trim(),
                            type: row.Type,
                            parent_id: parentCategory?.id || null,
                            company_id: currentCompany?.id,
                        };
                    });

                setCategoryImportModal((prev) => ({
                    ...prev,
                    isLoading: false,
                    csvData: categories,
                    step: "review",
                }));
            },
            error: (error) => {
                setCategoryImportModal((prev) => ({
                    ...prev,
                    isLoading: false,
                    error: `Error parsing CSV: ${error.message}`,
                }));
            },
        });
    };

    const handlePayeeFileUpload = (
        event: React.ChangeEvent<HTMLInputElement> | DragEvent
    ) => {
        const file =
            event instanceof DragEvent
                ? event.dataTransfer?.files[0]
                : event.target.files?.[0];

        if (!file) return;

        setPayeeImportModal((prev) => ({
            ...prev,
            isLoading: true,
            error: null,
        }));

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results: Papa.ParseResult<PayeeCSVRow>) => {
                const error = validatePayeeCSV(results);
                if (error) {
                    setPayeeImportModal((prev) => ({
                        ...prev,
                        isLoading: false,
                        error,
                    }));
                    return;
                }

                const payeeData = results.data
                    .filter((row: PayeeCSVRow) => row.Name)
                    .map((row: PayeeCSVRow) => ({
                        id: uuidv4(),
                        name: row.Name.trim(),
                        company_id: currentCompany?.id || "",
                    }));

                setPayeeImportModal((prev) => ({
                    ...prev,
                    isLoading: false,
                    csvData: payeeData,
                    step: "review",
                }));
            },
            error: (error) => {
                setPayeeImportModal((prev) => ({
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

    const handleCategoryDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer?.files[0];
        if (file) {
            const event = {
                target: { files: [file] },
            } as unknown as React.ChangeEvent<HTMLInputElement>;
            handleCategoryFileUpload(event);
        }
    };

    const handlePayeeDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer?.files[0];
        if (file) {
            const event = {
                target: { files: [file] },
            } as unknown as React.ChangeEvent<HTMLInputElement>;
            handlePayeeFileUpload(event);
        }
    };

    // Helper to display subaccounts indented
    const renderAccounts = (accounts: Category[], level = 0) => {
        // Get all parent accounts
        const parentAccounts = accounts.filter((acc) => acc.parent_id === null);

        return parentAccounts
            .flatMap((parent) => {
                // Get subaccounts for this parent
                const subAccounts = accounts.filter(
                    (acc) => acc.parent_id === parent.id
                );

                // If there are no subaccounts and parent doesn't match search, don't show parent
                if (subAccounts.length === 0 && !accounts.includes(parent)) {
                    return [];
                }

                // Return an array of <tr> elements: parent row + subaccount rows
                return [
                    <tr key={parent.id}>
                        <td
                            style={{ paddingLeft: `${level * 16 + 4}px` }}
                            className="border p-1 text-xs"
                        >
                            {editingId === parent.id ? (
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) =>
                                        setEditName(e.target.value)
                                    }
                                    className="w-full border-none outline-none bg-transparent text-xs"
                                    onKeyDown={(e) =>
                                        e.key === "Enter" && handleUpdate()
                                    }
                                    autoFocus
                                />
                            ) : (
                                parent.name
                            )}
                        </td>
                        <td className="border p-1 text-xs">
                            {editingId === parent.id ? (
                                <select
                                    value={editType}
                                    onChange={(e) => {
                                        setEditType(e.target.value);
                                        // Clear parent when type changes since parent must match type
                                        setEditParentId(null);
                                    }}
                                    className="w-full border-none outline-none bg-transparent text-xs"
                                    onKeyDown={(e) =>
                                        e.key === "Enter" && handleUpdate()
                                    }
                                >
                                    {ACCOUNT_TYPES.map((type) => (
                                        <option key={type} value={type}>
                                            {type}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                parent.type
                            )}
                        </td>
                        <td className="border p-1 text-xs">
                            {editingId === parent.id ? (
                                <select
                                    value={editParentId || ""}
                                    onChange={(e) =>
                                        setEditParentId(e.target.value || null)
                                    }
                                    className="w-full border-none outline-none bg-transparent text-xs"
                                    onKeyDown={(e) =>
                                        e.key === "Enter" && handleUpdate()
                                    }
                                >
                                    <option value="">No Parent</option>
                                    {parentOptions
                                        .filter(
                                            (opt) =>
                                                opt.id !== parent.id && // Can't be parent of itself
                                                (opt.type === editType ||
                                                    !editType)
                                        )
                                        .map((opt) => (
                                            <option key={opt.id} value={opt.id}>
                                                {opt.name} ({opt.type})
                                            </option>
                                        ))}
                                </select>
                            ) : (
                                ""
                            )}
                        </td>
                        <td className="border p-1 text-xs">
                            <div className="flex gap-2 justify-center">
                                <button
                                    onClick={() => handleEdit(parent)}
                                    className="text-xs hover:underline text-blue-600"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => handleDelete(parent.id)}
                                    className="text-xs hover:underline text-red-600"
                                >
                                    Delete
                                </button>
                            </div>
                        </td>
                    </tr>,
                    ...subAccounts.map((subAcc) => (
                        <tr key={subAcc.id}>
                            <td
                                style={{
                                    paddingLeft: `${(level + 1) * 16 + 4}px`,
                                }}
                                className="border p-1 text-xs"
                            >
                                {editingId === subAcc.id ? (
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) =>
                                            setEditName(e.target.value)
                                        }
                                        className="w-full border-none outline-none bg-transparent text-xs"
                                        onKeyDown={(e) =>
                                            e.key === "Enter" && handleUpdate()
                                        }
                                        autoFocus
                                    />
                                ) : (
                                    subAcc.name
                                )}
                            </td>
                            <td className="border p-1 text-xs">
                                {editingId === subAcc.id ? (
                                    <select
                                        value={editType}
                                        onChange={(e) => {
                                            setEditType(e.target.value);
                                            // Clear parent when type changes since parent must match type
                                            setEditParentId(null);
                                        }}
                                        className="w-full border-none outline-none bg-transparent text-xs"
                                        onKeyDown={(e) =>
                                            e.key === "Enter" && handleUpdate()
                                        }
                                    >
                                        {ACCOUNT_TYPES.map((type) => (
                                            <option key={type} value={type}>
                                                {type}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    subAcc.type
                                )}
                            </td>
                            <td className="border p-1 text-xs">
                                {editingId === subAcc.id ? (
                                    <select
                                        value={editParentId || ""}
                                        onChange={(e) =>
                                            setEditParentId(
                                                e.target.value || null
                                            )
                                        }
                                        className="w-full border-none outline-none bg-transparent text-xs"
                                        onKeyDown={(e) =>
                                            e.key === "Enter" && handleUpdate()
                                        }
                                    >
                                        <option value="">No Parent</option>
                                        {parentOptions
                                            .filter(
                                                (opt) =>
                                                    opt.id !== subAcc.id && // Can't be parent of itself
                                                    (opt.type === editType ||
                                                        !editType)
                                            )
                                            .map((opt) => (
                                                <option
                                                    key={opt.id}
                                                    value={opt.id}
                                                >
                                                    {opt.name} ({opt.type})
                                                </option>
                                            ))}
                                    </select>
                                ) : (
                                    parent.name
                                )}
                            </td>
                            <td className="border p-1 text-xs">
                                <div className="flex gap-2 justify-center">
                                    <button
                                        onClick={() => handleEdit(subAcc)}
                                        className="text-xs hover:underline text-blue-600"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => handleDelete(subAcc.id)}
                                        className="text-xs hover:underline text-red-600"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </td>
                        </tr>
                    )),
                ];
            })
            .filter(Boolean)
            .flat(); // Remove null entries and flatten
    };

    if (!hasCompanyContext) {
        return (
            <div className="p-4 bg-white text-gray-900 font-sans text-xs space-y-6">
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <h3 className="text-sm font-semibold text-yellow-800 mb-2">
                        Company Selection Required
                    </h3>
                    <p className="text-sm text-yellow-700">
                        Please select a company from the dropdown in the
                        navigation bar to manage chart of accounts.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 max-w-7xl mx-auto font-sans text-gray-900">
            <div className="flex gap-8">
                {/* Categories Section - Left Side */}
                <div className="flex-1">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold">Categories</h2>
                        <div className="flex gap-2">
                            <button
                                onClick={() =>
                                    setCategoryImportModal((prev) => ({
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
                            placeholder="Search Categories..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                    </div>

                    {/* Add Category Form */}
                    <div className="mb-4">
                        <form
                            onSubmit={handleAddAccount}
                            className="flex gap-2 items-center"
                        >
                            <input
                                type="text"
                                placeholder="Category Name"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                className="border border-gray-300 px-2 py-1 text-xs flex-1"
                                required
                            />
                            <select
                                value={newType}
                                onChange={(e) => setNewType(e.target.value)}
                                className="border border-gray-300 px-2 py-1 text-xs w-24"
                                required
                            >
                                <option value="">Type...</option>
                                {ACCOUNT_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                        {type}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={parentId || ""}
                                onChange={(e) =>
                                    setParentId(e.target.value || null)
                                }
                                className="border border-gray-300 px-2 py-1 text-xs flex-1"
                            >
                                <option value="">No Parent</option>
                                {parentOptions
                                    .filter(
                                        (opt) =>
                                            opt.type === newType || !newType
                                    )
                                    .map((opt) => (
                                        <option key={opt.id} value={opt.id}>
                                            {opt.name} ({opt.type})
                                        </option>
                                    ))}
                            </select>
                            <button
                                type="submit"
                                className="border border-gray-300 px-3 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200"
                            >
                                Add
                            </button>
                        </form>
                    </div>

                    {/* Categories Table */}
                    <div
                        className="bg-white rounded shadow-sm"
                        ref={categoriesTableRef}
                    >
                        {loading ? (
                            <div className="p-4 text-center text-gray-500 text-xs">
                                Loading...
                            </div>
                        ) : (
                            <table className="w-full border-collapse border border-gray-300 text-xs">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th
                                            className="border p-1 text-center font-semibold cursor-pointer hover:bg-gray-200"
                                            onClick={() =>
                                                handleCategorySort("name")
                                            }
                                        >
                                            Name{" "}
                                            {categorySortConfig.key ===
                                                "name" &&
                                                (categorySortConfig.direction ===
                                                "asc"
                                                    ? "↑"
                                                    : "↓")}
                                        </th>
                                        <th
                                            className="border p-1 text-center font-semibold cursor-pointer hover:bg-gray-200"
                                            onClick={() =>
                                                handleCategorySort("type")
                                            }
                                        >
                                            Type{" "}
                                            {categorySortConfig.key ===
                                                "type" &&
                                                (categorySortConfig.direction ===
                                                "asc"
                                                    ? "↑"
                                                    : "↓")}
                                        </th>
                                        <th
                                            className="border p-1 text-center font-semibold cursor-pointer hover:bg-gray-200"
                                            onClick={() =>
                                                handleCategorySort("parent")
                                            }
                                        >
                                            Parent Category{" "}
                                            {categorySortConfig.key ===
                                                "parent" &&
                                                (categorySortConfig.direction ===
                                                "asc"
                                                    ? "↑"
                                                    : "↓")}
                                        </th>
                                        <th className="border p-1 text-center font-semibold">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAccounts.length > 0 ? (
                                        renderAccounts(filteredAccounts)
                                    ) : (
                                        <tr>
                                            <td
                                                colSpan={4}
                                                className="text-center p-2 text-gray-500 text-xs"
                                            >
                                                No categories found.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Payees Section - Right Side */}
                <div className="w-96">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold">Payees</h2>
                        <div className="flex gap-2">
                            <button
                                onClick={() =>
                                    setPayeeImportModal((prev) => ({
                                        ...prev,
                                        isOpen: true,
                                    }))
                                }
                                className="px-3 py-1 border border-gray-300 rounded bg-gray-100 hover:bg-gray-200 text-xs"
                            >
                                Import
                            </button>
                        </div>
                    </div>

                    {/* Payee Search Bar */}
                    <div className="mb-3">
                        <input
                            type="text"
                            placeholder="Search Payees..."
                            value={payeeSearch}
                            onChange={(e) => setPayeeSearch(e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                        />
                    </div>

                    {/* Add Payee Form */}
                    <div className="mb-4">
                        <form
                            onSubmit={handleAddPayee}
                            className="flex gap-2 items-center"
                        >
                            <input
                                type="text"
                                placeholder="Payee Name"
                                value={newPayeeName}
                                onChange={(e) =>
                                    setNewPayeeName(e.target.value)
                                }
                                className="border border-gray-300 px-2 py-1 text-xs flex-1"
                                required
                            />
                            <button
                                type="submit"
                                className="border border-gray-300 px-3 py-1 rounded text-xs bg-gray-100 hover:bg-gray-200"
                            >
                                Add
                            </button>
                        </form>
                    </div>

                    {/* Payees Table */}
                    <div className="bg-white rounded shadow-sm">
                        <table className="w-full border-collapse border border-gray-300 text-xs">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th
                                        className="border p-1 text-center font-semibold cursor-pointer hover:bg-gray-200"
                                        onClick={() => handlePayeeSort("name")}
                                    >
                                        Name{" "}
                                        {payeeSortConfig.key === "name" &&
                                            (payeeSortConfig.direction === "asc"
                                                ? "↑"
                                                : "↓")}
                                    </th>
                                    <th className="border p-1 text-center font-semibold">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPayees.length > 0 ? (
                                    filteredPayees.map((payee) => (
                                        <tr key={payee.id}>
                                            <td className="border p-1 text-xs">
                                                {editingPayeeId === payee.id ? (
                                                    <input
                                                        type="text"
                                                        value={editPayeeName}
                                                        onChange={(e) =>
                                                            setEditPayeeName(
                                                                e.target.value
                                                            )
                                                        }
                                                        className="w-full border-none outline-none bg-transparent text-xs"
                                                        onBlur={
                                                            handleUpdatePayee
                                                        }
                                                        onKeyDown={(e) =>
                                                            e.key === "Enter" &&
                                                            handleUpdatePayee()
                                                        }
                                                        autoFocus
                                                    />
                                                ) : (
                                                    payee.name
                                                )}
                                            </td>
                                            <td className="border p-1 text-xs">
                                                <div className="flex gap-2 justify-center">
                                                    <button
                                                        onClick={() =>
                                                            handleEditPayee(
                                                                payee
                                                            )
                                                        }
                                                        className="text-xs hover:underline text-blue-600"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() =>
                                                            handleDeletePayee(
                                                                payee.id
                                                            )
                                                        }
                                                        className="text-xs hover:underline text-red-600"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td
                                            colSpan={2}
                                            className="text-center p-2 text-gray-500 text-xs"
                                        >
                                            No payees found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Category Import Modal */}
            {categoryImportModal.isOpen && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50">
                    <div className="bg-white rounded-lg p-6 w-[600px] overflow-y-auto shadow-xl">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold">
                                Import Categories
                            </h2>
                            <button
                                onClick={() =>
                                    setCategoryImportModal((prev) => ({
                                        ...prev,
                                        isOpen: false,
                                    }))
                                }
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {categoryImportModal.error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4">
                                {categoryImportModal.error}
                            </div>
                        )}

                        {categoryImportModal.isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {categoryImportModal.step === "upload" && (
                                    <>
                                        <div className="space-y-4">
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <h3 className="text-sm font-medium text-gray-700">
                                                        Upload CSV File
                                                    </h3>
                                                    <button
                                                        onClick={
                                                            downloadCategoriesTemplate
                                                        }
                                                        className="text-sm text-gray-600 hover:text-gray-800"
                                                    >
                                                        Download Template
                                                    </button>
                                                </div>

                                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                                    <h4 className="text-sm font-medium text-blue-800 mb-2">
                                                        CSV Format Instructions:
                                                    </h4>
                                                    <ul className="text-sm text-blue-700 space-y-1">
                                                        <li>
                                                            •{" "}
                                                            <strong>
                                                                Name:
                                                            </strong>{" "}
                                                            Category name
                                                            (required)
                                                        </li>
                                                        <li>
                                                            •{" "}
                                                            <strong>
                                                                Type:
                                                            </strong>{" "}
                                                            One of:{" "}
                                                            {ACCOUNT_TYPES.join(
                                                                ", "
                                                            )}
                                                        </li>
                                                        <li>
                                                            •{" "}
                                                            <strong>
                                                                Parent Category:
                                                            </strong>{" "}
                                                            Name of parent
                                                            category (optional)
                                                        </li>
                                                    </ul>
                                                </div>
                                            </div>
                                            <div
                                                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center transition-colors duration-200 hover:border-gray-400"
                                                onDragOver={handleDragOver}
                                                onDrop={handleCategoryDrop}
                                            >
                                                <input
                                                    type="file"
                                                    accept=".csv"
                                                    onChange={
                                                        handleCategoryFileUpload
                                                    }
                                                    className="hidden"
                                                    id="category-csv-upload"
                                                />
                                                <label
                                                    htmlFor="category-csv-upload"
                                                    className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                                                >
                                                    Choose CSV File
                                                </label>
                                                <p className="mt-2 text-sm text-gray-500">
                                                    Drag and drop your CSV file
                                                    here, or click to browse
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex justify-end space-x-2 mt-4">
                                            <button
                                                onClick={() =>
                                                    setCategoryImportModal(
                                                        (prev) => ({
                                                            ...prev,
                                                            isOpen: false,
                                                        })
                                                    )
                                                }
                                                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </>
                                )}
                                {categoryImportModal.step === "review" && (
                                    <>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <h3 className="text-sm font-medium text-gray-700">
                                                    Review Categories
                                                </h3>
                                            </div>
                                            <div className="border rounded-lg overflow-hidden">
                                                <table className="min-w-full divide-y divide-gray-200">
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={
                                                                        categoryImportModal
                                                                            .csvData
                                                                            .length >
                                                                            0 &&
                                                                        categoryImportModal
                                                                            .selectedCategories
                                                                            .size ===
                                                                            categoryImportModal
                                                                                .csvData
                                                                                .length
                                                                    }
                                                                    onChange={(
                                                                        e
                                                                    ) => {
                                                                        if (
                                                                            e
                                                                                .target
                                                                                .checked
                                                                        ) {
                                                                            setCategoryImportModal(
                                                                                (
                                                                                    prev
                                                                                ) => ({
                                                                                    ...prev,
                                                                                    selectedCategories:
                                                                                        new Set(
                                                                                            categoryImportModal.csvData.map(
                                                                                                (
                                                                                                    cat
                                                                                                ) =>
                                                                                                    cat.id
                                                                                            )
                                                                                        ),
                                                                                })
                                                                            );
                                                                        } else {
                                                                            setCategoryImportModal(
                                                                                (
                                                                                    prev
                                                                                ) => ({
                                                                                    ...prev,
                                                                                    selectedCategories:
                                                                                        new Set(),
                                                                                })
                                                                            );
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
                                                                Parent
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="bg-white divide-y divide-gray-200">
                                                        {categoryImportModal.csvData.map(
                                                            (category) => (
                                                                <tr
                                                                    key={
                                                                        category.id
                                                                    }
                                                                >
                                                                    <td className="px-4 py-2 whitespace-nowrap w-8 text-left">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={categoryImportModal.selectedCategories.has(
                                                                                category.id
                                                                            )}
                                                                            onChange={(
                                                                                e
                                                                            ) => {
                                                                                const newSelected =
                                                                                    new Set(
                                                                                        categoryImportModal.selectedCategories
                                                                                    );
                                                                                if (
                                                                                    e
                                                                                        .target
                                                                                        .checked
                                                                                ) {
                                                                                    newSelected.add(
                                                                                        category.id
                                                                                    );
                                                                                } else {
                                                                                    newSelected.delete(
                                                                                        category.id
                                                                                    );
                                                                                }
                                                                                setCategoryImportModal(
                                                                                    (
                                                                                        prev
                                                                                    ) => ({
                                                                                        ...prev,
                                                                                        selectedCategories:
                                                                                            newSelected,
                                                                                    })
                                                                                );
                                                                            }}
                                                                            className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                                                        />
                                                                    </td>
                                                                    <td className="px-4 py-2 text-sm text-gray-900">
                                                                        {
                                                                            category.name
                                                                        }
                                                                    </td>
                                                                    <td className="px-4 py-2 text-sm text-gray-900">
                                                                        {
                                                                            category.type
                                                                        }
                                                                    </td>
                                                                    <td className="px-4 py-2 text-sm text-gray-900">
                                                                        {category.parent_id
                                                                            ? accounts.find(
                                                                                  (
                                                                                      acc
                                                                                  ) =>
                                                                                      acc.id ===
                                                                                      category.parent_id
                                                                              )
                                                                                  ?.name ||
                                                                              "Unknown"
                                                                            : "-"}
                                                                    </td>
                                                                </tr>
                                                            )
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <div className="text-sm font-medium">
                                                {categoryImportModal
                                                    .selectedCategories.size >
                                                    0 && (
                                                    <span className="text-gray-600">
                                                        {
                                                            categoryImportModal
                                                                .selectedCategories
                                                                .size
                                                        }{" "}
                                                        selected
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex justify-end space-x-2 mt-4">
                                                <button
                                                    onClick={() =>
                                                        setCategoryImportModal(
                                                            (prev) => ({
                                                                ...prev,
                                                                step: "upload",
                                                            })
                                                        )
                                                    }
                                                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                                                >
                                                    Back
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        setCategoryImportModal(
                                                            (prev) => ({
                                                                ...prev,
                                                                isLoading: true,
                                                                error: null,
                                                            })
                                                        );
                                                        try {
                                                            if (
                                                                !currentCompany
                                                            ) {
                                                                throw new Error(
                                                                    "No company selected. Please select a company first."
                                                                );
                                                            }

                                                            const selectedCategories =
                                                                categoryImportModal.csvData.filter(
                                                                    (cat) =>
                                                                        categoryImportModal.selectedCategories.has(
                                                                            cat.id
                                                                        )
                                                                );

                                                            if (
                                                                selectedCategories.length ===
                                                                0
                                                            ) {
                                                                throw new Error(
                                                                    "No categories selected for import."
                                                                );
                                                            }

                                                            const categoriesToInsert =
                                                                selectedCategories.map(
                                                                    (cat) => ({
                                                                        name: cat.name,
                                                                        type: cat.type,
                                                                        parent_id:
                                                                            cat.parent_id,
                                                                        company_id:
                                                                            currentCompany.id,
                                                                    })
                                                                );

                                                            const { error } =
                                                                await supabase
                                                                    .from(
                                                                        "chart_of_accounts"
                                                                    )
                                                                    .insert(
                                                                        categoriesToInsert
                                                                    );

                                                            if (error) {
                                                                throw new Error(
                                                                    error.message
                                                                );
                                                            }

                                                            setCategoryImportModal(
                                                                {
                                                                    isOpen: false,
                                                                    step: "upload",
                                                                    csvData: [],
                                                                    isLoading:
                                                                        false,
                                                                    error: null,
                                                                    selectedCategories:
                                                                        new Set(),
                                                                }
                                                            );

                                                            fetchAccounts();
                                                            fetchParentOptions();
                                                        } catch (error) {
                                                            setCategoryImportModal(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    isLoading:
                                                                        false,
                                                                    error:
                                                                        error instanceof
                                                                        Error
                                                                            ? error.message
                                                                            : "Failed to import categories. Please try again.",
                                                                })
                                                            );
                                                        }
                                                    }}
                                                    className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
                                                >
                                                    Import Categories
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

            {/* Payee Import Modal */}
            {payeeImportModal.isOpen && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center h-full z-50">
                    <div className="bg-white rounded-lg p-6 w-[600px] overflow-y-auto shadow-xl">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold">
                                Import Payees
                            </h2>
                            <button
                                onClick={() =>
                                    setPayeeImportModal((prev) => ({
                                        ...prev,
                                        isOpen: false,
                                    }))
                                }
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {payeeImportModal.error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4">
                                {payeeImportModal.error}
                            </div>
                        )}

                        {payeeImportModal.isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {payeeImportModal.step === "upload" && (
                                    <>
                                        <div className="space-y-4">
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <h3 className="text-sm font-medium text-gray-700">
                                                        Upload CSV File
                                                    </h3>
                                                    <button
                                                        onClick={
                                                            downloadPayeesTemplate
                                                        }
                                                        className="text-sm text-gray-600 hover:text-gray-800"
                                                    >
                                                        Download Template
                                                    </button>
                                                </div>

                                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                                    <h4 className="text-sm font-medium text-blue-800 mb-2">
                                                        CSV Format Instructions:
                                                    </h4>
                                                    <ul className="text-sm text-blue-700 space-y-1">
                                                        <li>
                                                            •{" "}
                                                            <strong>
                                                                Name:
                                                            </strong>{" "}
                                                            Payee name
                                                            (required)
                                                        </li>
                                                    </ul>
                                                </div>
                                            </div>
                                            <div
                                                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center transition-colors duration-200 hover:border-gray-400"
                                                onDragOver={handleDragOver}
                                                onDrop={handlePayeeDrop}
                                            >
                                                <input
                                                    type="file"
                                                    accept=".csv"
                                                    onChange={
                                                        handlePayeeFileUpload
                                                    }
                                                    className="hidden"
                                                    id="payee-csv-upload"
                                                />
                                                <label
                                                    htmlFor="payee-csv-upload"
                                                    className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                                                >
                                                    Choose CSV File
                                                </label>
                                                <p className="mt-2 text-sm text-gray-500">
                                                    Drag and drop your CSV file
                                                    here, or click to browse
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex justify-end space-x-2 mt-4">
                                            <button
                                                onClick={() =>
                                                    setPayeeImportModal(
                                                        (prev) => ({
                                                            ...prev,
                                                            isOpen: false,
                                                        })
                                                    )
                                                }
                                                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </>
                                )}
                                {payeeImportModal.step === "review" && (
                                    <>
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center">
                                                <h3 className="text-sm font-medium text-gray-700">
                                                    Review Payees
                                                </h3>
                                            </div>
                                            <div className="border rounded-lg overflow-hidden">
                                                <table className="min-w-full divide-y divide-gray-200">
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={
                                                                        payeeImportModal
                                                                            .csvData
                                                                            .length >
                                                                            0 &&
                                                                        payeeImportModal
                                                                            .selectedPayees
                                                                            .size ===
                                                                            payeeImportModal
                                                                                .csvData
                                                                                .length
                                                                    }
                                                                    onChange={(
                                                                        e
                                                                    ) => {
                                                                        if (
                                                                            e
                                                                                .target
                                                                                .checked
                                                                        ) {
                                                                            setPayeeImportModal(
                                                                                (
                                                                                    prev
                                                                                ) => ({
                                                                                    ...prev,
                                                                                    selectedPayees:
                                                                                        new Set(
                                                                                            payeeImportModal.csvData.map(
                                                                                                (
                                                                                                    payee
                                                                                                ) =>
                                                                                                    payee.id
                                                                                            )
                                                                                        ),
                                                                                })
                                                                            );
                                                                        } else {
                                                                            setPayeeImportModal(
                                                                                (
                                                                                    prev
                                                                                ) => ({
                                                                                    ...prev,
                                                                                    selectedPayees:
                                                                                        new Set(),
                                                                                })
                                                                            );
                                                                        }
                                                                    }}
                                                                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                                                />
                                                            </th>
                                                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                Name
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="bg-white divide-y divide-gray-200">
                                                        {payeeImportModal.csvData.map(
                                                            (payee) => (
                                                                <tr
                                                                    key={
                                                                        payee.id
                                                                    }
                                                                >
                                                                    <td className="px-4 py-2 whitespace-nowrap w-8 text-left">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={payeeImportModal.selectedPayees.has(
                                                                                payee.id
                                                                            )}
                                                                            onChange={(
                                                                                e
                                                                            ) => {
                                                                                const newSelected =
                                                                                    new Set(
                                                                                        payeeImportModal.selectedPayees
                                                                                    );
                                                                                if (
                                                                                    e
                                                                                        .target
                                                                                        .checked
                                                                                ) {
                                                                                    newSelected.add(
                                                                                        payee.id
                                                                                    );
                                                                                } else {
                                                                                    newSelected.delete(
                                                                                        payee.id
                                                                                    );
                                                                                }
                                                                                setPayeeImportModal(
                                                                                    (
                                                                                        prev
                                                                                    ) => ({
                                                                                        ...prev,
                                                                                        selectedPayees:
                                                                                            newSelected,
                                                                                    })
                                                                                );
                                                                            }}
                                                                            className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                                                        />
                                                                    </td>
                                                                    <td className="px-4 py-2 text-sm text-gray-900">
                                                                        {
                                                                            payee.name
                                                                        }
                                                                    </td>
                                                                </tr>
                                                            )
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <div className="text-sm font-medium">
                                                {payeeImportModal.selectedPayees
                                                    .size > 0 && (
                                                    <span className="text-gray-600">
                                                        {
                                                            payeeImportModal
                                                                .selectedPayees
                                                                .size
                                                        }{" "}
                                                        selected
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex justify-end space-x-2 mt-4">
                                                <button
                                                    onClick={() =>
                                                        setPayeeImportModal(
                                                            (prev) => ({
                                                                ...prev,
                                                                step: "upload",
                                                            })
                                                        )
                                                    }
                                                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                                                >
                                                    Back
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        setPayeeImportModal(
                                                            (prev) => ({
                                                                ...prev,
                                                                isLoading: true,
                                                                error: null,
                                                            })
                                                        );
                                                        try {
                                                            if (
                                                                !currentCompany
                                                            ) {
                                                                throw new Error(
                                                                    "No company selected. Please select a company first."
                                                                );
                                                            }

                                                            const selectedPayees =
                                                                payeeImportModal.csvData.filter(
                                                                    (payee) =>
                                                                        payeeImportModal.selectedPayees.has(
                                                                            payee.id
                                                                        )
                                                                );

                                                            if (
                                                                selectedPayees.length ===
                                                                0
                                                            ) {
                                                                throw new Error(
                                                                    "No payees selected for import."
                                                                );
                                                            }

                                                            const payeesToInsert =
                                                                selectedPayees.map(
                                                                    (
                                                                        payee
                                                                    ) => ({
                                                                        name: payee.name,
                                                                        company_id:
                                                                            currentCompany.id,
                                                                    })
                                                                );

                                                            const { error } =
                                                                await supabase
                                                                    .from(
                                                                        "payees"
                                                                    )
                                                                    .insert(
                                                                        payeesToInsert
                                                                    );

                                                            if (error) {
                                                                throw new Error(
                                                                    error.message
                                                                );
                                                            }

                                                            setPayeeImportModal(
                                                                {
                                                                    isOpen: false,
                                                                    step: "upload",
                                                                    csvData: [],
                                                                    isLoading:
                                                                        false,
                                                                    error: null,
                                                                    selectedPayees:
                                                                        new Set(),
                                                                }
                                                            );

                                                            fetchPayees();
                                                        } catch (error) {
                                                            setPayeeImportModal(
                                                                (prev) => ({
                                                                    ...prev,
                                                                    isLoading:
                                                                        false,
                                                                    error:
                                                                        error instanceof
                                                                        Error
                                                                            ? error.message
                                                                            : "Failed to import payees. Please try again.",
                                                                })
                                                            );
                                                        }
                                                    }}
                                                    className="px-4 py-2 text-sm bg-gray-900 text-white rounded hover:bg-gray-800"
                                                >
                                                    Import Payees
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
