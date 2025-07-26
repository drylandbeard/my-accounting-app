"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Transaction } from "../_types";

interface UseRetainedEarningsDataProps {
  companyId: string | null;
  currentPeriodStartDate: string;
}

interface UseRetainedEarningsDataReturn {
  retainedEarningsEntries: Transaction[];
  loading: boolean;
}

export const useRetainedEarningsData = ({
  companyId,
  currentPeriodStartDate,
}: UseRetainedEarningsDataProps): UseRetainedEarningsDataReturn => {
  const [retainedEarningsEntries, setRetainedEarningsEntries] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchRetainedEarningsData = async () => {
      if (!companyId || !currentPeriodStartDate) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        // Calculate the end date for retained earnings (day before current period starts)
        const reportStartDate = new Date(currentPeriodStartDate + 'T00:00:00');
        if (isNaN(reportStartDate.getTime())) {
          console.error('Invalid currentPeriodStartDate for retained earnings:', currentPeriodStartDate);
          setLoading(false);
          return;
        }
        
        const retainedEarningsEndDate = new Date(reportStartDate.getTime() - 24 * 60 * 60 * 1000);
        const retainedEarningsStartDate = "2000-01-01";
        const retainedEarningsEndDateStr = retainedEarningsEndDate.toISOString().split('T')[0];

        console.log(`Fetching retained earnings data from ${retainedEarningsStartDate} to ${retainedEarningsEndDateStr}`);

        // Fetch journal entries for retained earnings period with pagination
        let allJournalData: Array<{
          id: string;
          date: string;
          description: string;
          chart_account_id: string;
          debit: number;
          credit: number;
          transaction_id: string;
          company_id: string;
        }> = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data: journalData, error } = await supabase
            .from("journal")
            .select("*")
            .eq("company_id", companyId)
            .gte("date", retainedEarningsStartDate)
            .lte("date", retainedEarningsEndDateStr)
            .range(page * pageSize, (page + 1) * pageSize - 1)
            .order("date", { ascending: true });

          if (error) {
            console.error("Error fetching retained earnings journal data:", error);
            break;
          }

          if (journalData && journalData.length > 0) {
            allJournalData = [...allJournalData, ...journalData];
            page++;
            hasMore = journalData.length === pageSize;
          } else {
            hasMore = false;
          }
        }

        // Fetch manual journal entries for retained earnings period with pagination
        let allManualJournalData: Array<{
          id: string;
          date: string;
          description?: string;
          je_name?: string;
          chart_account_id: string;
          debit: number;
          credit: number;
          reference_number?: string;
          company_id: string;
        }> = [];
        page = 0;
        hasMore = true;

        while (hasMore) {
          const { data: manualJournalData, error } = await supabase
            .from("manual_journal_entries")
            .select("*")
            .eq("company_id", companyId)
            .gte("date", retainedEarningsStartDate)
            .lte("date", retainedEarningsEndDateStr)
            .range(page * pageSize, (page + 1) * pageSize - 1)
            .order("date", { ascending: true });

          if (error) {
            console.error("Error fetching retained earnings manual journal data:", error);
            break;
          }

          if (manualJournalData && manualJournalData.length > 0) {
            allManualJournalData = [...allManualJournalData, ...manualJournalData];
            page++;
            hasMore = manualJournalData.length === pageSize;
          } else {
            hasMore = false;
          }
        }

        console.log(`Retained earnings journal entries: ${allJournalData.length}`);
        console.log(`Retained earnings manual entries: ${allManualJournalData.length}`);

        // Transform and combine both datasets
        const regularEntries: Transaction[] = allJournalData.map((entry) => ({
          id: entry.id,
          date: entry.date,
          description: entry.description,
          chart_account_id: entry.chart_account_id,
          debit: entry.debit,
          credit: entry.credit,
          transaction_id: entry.transaction_id,
          source: "journal" as const,
        }));

        const manualEntries: Transaction[] = allManualJournalData.map((entry) => ({
          id: entry.id,
          date: entry.date,
          description: entry.description || entry.je_name || "Manual Entry",
          chart_account_id: entry.chart_account_id,
          debit: entry.debit,
          credit: entry.credit,
          transaction_id: entry.reference_number || entry.id,
          source: "manual" as const,
        }));

        // Combine all entries
        const allEntries = [...regularEntries, ...manualEntries];
        setRetainedEarningsEntries(allEntries);
        
        console.log(`Total retained earnings entries: ${allEntries.length}`);
      } catch (error) {
        console.error("Error fetching retained earnings data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRetainedEarningsData();
  }, [companyId, currentPeriodStartDate]);

  return { retainedEarningsEntries, loading };
};