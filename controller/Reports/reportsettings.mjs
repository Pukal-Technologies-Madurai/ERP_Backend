import sql from "mssql";
import { servError, noData, dataFound } from "../../res.mjs";

export const MenuSettings = async (req, res) => {
    try {

        const result = await new sql.Request()

            .query("EXEC Reporting_Online_Menu_Settings_SP")

        const recordset = result.recordset ?? [];
        if (!recordset.length) return noData(res);

        dataFound(res, recordset);
    } catch (error) {
        servError(error, res);
    }

};

export const executeSP = async (req, res) => {
    try {
        const { spName, params } = req.body;

        if (!spName) {
            return res.status(400).json({
                success: false,
                message: "Stored Procedure name is required"
            });
        }

        const request = new sql.Request();

        /* ================= GET SP PARAMS ================= */

        const paramMeta = await new sql.Request()
            .input("spName", sql.NVarChar, spName)
            .query(`
                SELECT name 
                FROM sys.parameters 
                WHERE object_id = OBJECT_ID(@spName)
            `);

        const spParams = paramMeta.recordset.map(p =>
            p.name.replace("@", "")
        );

        /* ================= MAP PARAMS ================= */

        spParams.forEach((paramName) => {
            let value = undefined;

            // 🔥 case-insensitive match
            if (params && typeof params === "object") {
                const normalize = (str) => str.replace(/_/g, "").toLowerCase();

                const matchKey = Object.keys(params || {}).find(
                    k => normalize(k) === normalize(paramName)
                );


                if (matchKey) {
                    value = params[matchKey];
                }
            }

            if (value !== undefined) {
                request.input(paramName, value);
            } else {
                /* 🔥 DEFAULT HANDLING (customize if needed) */
                if (paramName.toLowerCase() === "ledger_id") {
                    request.input("Ledger_Id", 0); // default fallback
                }
                // 👉 You can add more defaults here if needed
            }
        });

        /* ================= EXECUTE ================= */

        const result = await request.execute(spName);

        const recordset = result.recordset ?? [];

        if (!recordset.length) return noData(res);

        return dataFound(res, recordset);

    } catch (error) {
        console.error("Execute SP Error:", error);
        return servError(error, res);
    }
};

export const saveReportSettings = async (req, res) => {
    const transaction = new sql.Transaction();

    try {
        const {
            reportName,
            parentReport,
            abstractColumns,
            expandedColumns,
            abstractSP,
            expandedSP
        } = req.body;

        if (
            !reportName ||
            !parentReport ||
            !abstractColumns?.length ||
            !expandedColumns?.length ||
            !abstractSP ||
            !expandedSP
        ) {
            return res.status(400).json({ message: "Invalid payload" });
        }

        await transaction.begin();

        /* ================= INSERT REPORT ================= */

        const reportResult = await new sql.Request(transaction)
            .input("Report_Name", sql.VarChar, reportName)
            .input("Parent_Report", sql.VarChar, parentReport)
            .input("CreatedBy", sql.Int, 1)
            .query(`
                INSERT INTO tbl_ERP_Report 
                (Report_Name, Parent_Report, CreatedBy, CreatedAt)
                OUTPUT INSERTED.Report_Id
                VALUES (@Report_Name, @Parent_Report, @CreatedBy, GETDATE())
            `);

        if (!reportResult.recordset?.length) {
            await transaction.rollback();
            return res.status(500).json({ message: "Report insert failed" });
        }

        const reportId = reportResult.recordset[0].Report_Id;

        /* ================= INSERT REPORT TYPES (FIXED 1 & 2) ================= */

        await new sql.Request(transaction)
            .input("Report_Id", sql.Int, reportId)
            .input("AbstractSP", sql.VarChar, abstractSP)
            .input("ExpandedSP", sql.VarChar, expandedSP)
            .query(`
        SET IDENTITY_INSERT tbl_ERP_ReportType ON;

        INSERT INTO tbl_ERP_ReportType (Type_Id, Report_Id, Report_Type)
        VALUES (1, @Report_Id, @AbstractSP);

        INSERT INTO tbl_ERP_ReportType (Type_Id, Report_Id, Report_Type)
        VALUES (2, @Report_Id, @ExpandedSP);

        SET IDENTITY_INSERT tbl_ERP_ReportType OFF;
    `);

        const abstractTypeId = 1;
        const expandedTypeId = 2;

        /* ================= INSERT FIELDS ================= */

        const insertFields = async (cols, typeId) => {
            let fieldIndex = 1;

            const normalizeType = (type = "") => {
                const t = type.toLowerCase();

                if (t.includes("int")) return "int";
                if (t.includes("decimal") || t.includes("numeric")) return "decimal";
                if (t.includes("date") || t.includes("time")) return "datetime";
                if (t.includes("bit")) return "bit";

                return "nvarchar";
            };

            for (let col of cols) {
                if (!col.enabled) continue;

                await new sql.Request(transaction)
                    .input("Report_Id", sql.Int, reportId)
                    .input("Type_Id", sql.Int, typeId) // ✅ FIXED ID
                    .input("Field_Id", sql.Int, fieldIndex++)
                    .input("Field_Name", sql.VarChar, col.key)
                    .input("Fied_Data", sql.VarChar, normalizeType(col.dataType))
                    .input("Enable_By", sql.Int, 1)
                    .input("Order_By", sql.Int, col.order ?? 0)
                    .input("Group_By", sql.Int, col.groupBy ?? 0)
                    .query(`
                        INSERT INTO tbl_ERP_Report_Fileds
                        (Report_Id, Type_Id, Field_Id, Field_Name, Fied_Data, Enable_By, Order_By, Group_By)
                        VALUES
                        (@Report_Id, @Type_Id, @Field_Id, @Field_Name, @Fied_Data, @Enable_By, @Order_By, @Group_By)
                    `);
            }
        };

        await insertFields(abstractColumns, abstractTypeId);
        await insertFields(expandedColumns, expandedTypeId);

        /* ================= COMMIT ================= */

        await transaction.commit();

        return res.json({
            success: true,
            message: "Report saved successfully",
            reportId
        });

    } catch (error) {
        console.error("SAVE ERROR:", error);

        try {
            await transaction.rollback();
        } catch { }

        return res.status(500).json({
            success: false,
            message: "Error saving report"
        });
    }
};

export const getReportList = async (req, res) => {
    try {
        const result = await new sql.Request().query(`
            SELECT 
                r.Report_Id,
                r.Report_Name,
                r.Parent_Report,
                rt.Type_Id,
                rt.Report_Type
            FROM tbl_ERP_Report r
            LEFT JOIN tbl_ERP_ReportType rt 
                ON r.Report_Id = rt.Report_Id
            ORDER BY r.Parent_Report, r.Report_Name
        `);

        const rows = result.recordset || [];

        // 🔥 Group by Parent_Report
        const grouped = {};

        rows.forEach((row) => {
            const parent = row.Parent_Report || "Others";

            if (!grouped[parent]) {
                grouped[parent] = [];
            }

            let report = grouped[parent].find(
                (r) => r.Report_Id === row.Report_Id
            );

            if (!report) {
                report = {
                    Report_Id: row.Report_Id,
                    Report_Name: row.Report_Name,
                    templates: []
                };
                grouped[parent].push(report);
            }

            if (row.Type_Id) {
                report.templates.push({
                    Type_Id: row.Type_Id,
                    Report_Type: row.Report_Type
                });
            }
        });

        return res.json({
            success: true,
            data: grouped
        });

    } catch (error) {
        console.error("LIST ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching reports"
        });
    }
};

export const getReportEditData = async (req, res) => {
    try {
        const { reportId, typeId } = req.query;

        if (!reportId || !typeId) {
            return res.status(400).json({ message: "Missing params" });
        }

        /* ================= REPORT INFO ================= */

        const reportResult = await sql.query`
            SELECT Report_Id, Report_Name, Parent_Report
            FROM tbl_ERP_Report
            WHERE Report_Id = ${reportId}
        `;

        if (!reportResult.recordset.length) {
            return res.status(404).json({ message: "Report not found" });
        }

        const reportInfo = reportResult.recordset[0];

        /* ================= TYPE NAME ================= */

        const typeResult = await sql.query`
            SELECT Report_Type
            FROM tbl_ERP_ReportType
            WHERE Report_Id = ${reportId}
            AND Type_Id = ${typeId}
        `;

        const reportType = typeResult.recordset[0]?.Report_Type;

        /* ================= CALL MASTER SP ================= */

        const spResult = await new sql.Request()
            .input("Report_Id", sql.Int, reportId)
            .input("Type_Id", sql.Int, typeId)
            .input("Source_Name", sql.VarChar, reportType) // SP expects this
            .query(`
                EXEC Reporting_Online_Menu_Settings_SP_1 
                @Report_Id, 
                @Type_Id, 
                @Source_Name
            `);

        const rows = spResult.recordset || [];

        if (!rows.length) {
            return res.json({
                success: true,
                data: { reportInfo, columns: [] }
            });
        }

        /* ================= MAP DIRECTLY FROM SP ================= */

        const columns = rows.map((row, index) => ({
            key: row.Field_Name,
            label: row.Field_Name,

            // ✅ MAIN REQUIREMENT
            enabled: row.Enable_By === 1,

            order: row.Order_By ?? index + 1,
            groupBy: row.Group_By ?? 0,

            dataType: row.Fied_Data || "nvarchar"
        }));

        return res.json({
            success: true,
            data: {
                reportInfo,
                type: reportType, // optional (for UI)
                columns
            }
        });

    } catch (error) {
        console.error("EDIT LOAD ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Error loading edit data"
        });
    }
};
export const updateReportSettings = async (req, res) => {
    const transaction = new sql.Transaction();

    try {
        const { reportId, typeId, columns } = req.body;

        if (!reportId || !typeId) {
            return res.status(400).json({ message: "Invalid payload" });
        }

        await transaction.begin();

        /* 🔥 DELETE OLD */
        await new sql.Request(transaction)
            .input("Report_Id", sql.Int, reportId)
            .input("Type_Id", sql.Int, typeId)
            .query(`
                DELETE FROM tbl_ERP_Report_Fileds
                WHERE Report_Id = @Report_Id AND Type_Id = @Type_Id
            `);

        /* 🔥 INSERT NEW */
        let fieldIndex = 1;

        for (let col of columns) {
            if (!col.enabled) continue;

            await new sql.Request(transaction)
                .input("Report_Id", sql.Int, reportId)
                .input("Type_Id", sql.Int, typeId)
                .input("Field_Id", sql.Int, fieldIndex++)
                .input("Field_Name", sql.VarChar, col.key)
                .input("Fied_Data", sql.VarChar, col.dataType)
                .input("Enable_By", sql.Int, 1)
                .input("Order_By", sql.Int, col.order ?? 0)
                .input("Group_By", sql.Int, col.groupBy ?? 0)
                .query(`
                    INSERT INTO tbl_ERP_Report_Fileds
                    (Report_Id, Type_Id, Field_Id, Field_Name, Fied_Data, Enable_By, Order_By, Group_By)
                    VALUES
                    (@Report_Id, @Type_Id, @Field_Id, @Field_Name, @Fied_Data, @Enable_By, @Order_By, @Group_By)
                `);
        }

        await transaction.commit();

        return res.json({ success: true });

    } catch (error) {
        await transaction.rollback();
        return res.status(500).json({ success: false });
    }
};

export const getReportsByParent = async (req, res) => {
    try {
        const { parentReport } = req.query;

        if (!parentReport) {
            return res.status(400).json({ message: "Parent report required" });
        }

        const result = await sql.query`
            SELECT Report_Id, Report_Name
            FROM tbl_ERP_Report
            WHERE Parent_Report = ${parentReport}
        `;

        return res.json({
            success: true,
            data: result.recordset
        });

    } catch (err) {
        console.error("GET REPORTS ERROR:", err);
        return res.status(500).json({
            success: false,
            message: "Error fetching reports"
        });
    }
};

export const executeReportByTemplate = async (req, res) => {
    try {
        const { reportId, typeId } = req.query;

        if (!reportId || !typeId) {
            return res.status(400).json({ message: "Missing params" });
        }

        /* ===== GET SP NAME ===== */
        const typeResult = await sql.query`
            SELECT Report_Type
            FROM tbl_ERP_ReportType
            WHERE Report_Id = ${reportId}
            AND Type_Id = ${typeId}
        `;

        const spName = typeResult.recordset[0]?.Report_Type;

        if (!spName) {
            return res.status(400).json({ message: "SP not found" });
        }

        /* ===== EXECUTE SP ===== */
        const result = await new sql.Request()
            .input("Report_Id", sql.Int, reportId)
            .input("Type_Id", sql.Int, typeId)
            .input("Source_Name", sql.VarChar, spName)
            .query(`
                EXEC Reporting_Online_Menu_Settings_SP_1
                @Report_Id,
                @Type_Id,
                @Source_Name
            `);

        return res.json({
            success: true,
            data: result.recordset || []
        });

    } catch (error) {
        console.error("EXEC REPORT ERROR:", error);
        return res.status(500).json({
            success: false,
            message: "Error executing report"
        });
    }
};