import sql from 'mssql';
import { dataFound, failed, invalidInput, noData, sentData, servError, success } from '../../res.mjs'

const lom = () => {

          const getDetailsData = async (req, res) => {
                         try {

                           const results = [];
                            const tables = [
                            { master: 'Cost Center', table: 'tbl_ERP_Cost_Center' },
                            { master: 'Cost Categories', table: 'tbl_ERP_Cost_Category' },
                            {master:'Ledger',table:'tbl_Account_Master'},
                            {master:'Godown',table:'tbl_Godown_Master'},
                            {master:'Group',table:'tbl_Accounting_Group'},
                            {master:'Stock',table:'tbl_Product_Master'},
                            {master:'Voucher type',table:'tbl_Voucher_Type'},
                            {master:'Units',table:'tbl_UOM'},
                            {master:'Stock Group',table:'-'},
                            {master:'Currency',table:'-'},
                            {master:'Brand',table:'tbl_Brand_Master'},
                            {master:'Area',table:'tbl_Area_Master'},
                            {master:'Pos Brand',table:'tbl_POS_Brand'},
                                     
                            {master:'Route Master',table:'tbl_Route_Master'},
                            {master:'Pos_Rate_Master',table:'tbl_Pos_Rate_Master'}
                            ];                        

                            for (const { master, table } of tables) {
                              try {
                                const countRes = await new sql.Request().query(`SELECT COUNT(*) AS count FROM [dbo].[${table}]`);
                                const colRes = await new sql.Request().query(`SELECT * FROM [dbo].[${table}]`);
                                const columnCount = Object.keys(colRes.recordset.columns).length;
                                const columnRes = await new sql.Request().query(`
                                  SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
                                  FROM INFORMATION_SCHEMA.COLUMNS
                                  WHERE TABLE_NAME = '${table}'
                                `);                        

                                     const columnDetails = columnRes.recordset || [];
                                results.push({
                                  master,
                                  count: countRes.recordset[0].count,
                                  fields: columnCount,
                                  columns: columnDetails
                                });
                              } catch (err) {
                                results.push({
                                  master,
                                  count: '-',
                                  fields: '-',
                                  error: err.message
                                });
                              }
                            }
                            const wrappedResults = { ERP: results };
                        return dataFound(res, wrappedResults, 'Data Found');                        

                          } catch (e) {
                           servError(e,res)
                          }
                        };                        

                      const getTallyDatabase = async (req, res) => {
                        try {
                          const TALLY_DB = "Online_SMT_Tally";
                      
                          const tables = [
                            { master: "Cost Center", table: "cost_centre_ob" },
                            { master: "Cost Categories", table: "cost_catagory_ob" },
                            {master: "Ledger", table: "ledger_ob" },
                            {master: "Godown", table: "godown_ob" },
                            {master: "Group", table: "group_ob" },
                            {master: "Stock", table: "stock_items_ob" },
                            {master: "Voucher Group", table: "tbl_Voucher_Group" },
                            {master: "Units", table: "units_ob" },
                            {master: "Stock Group", table: "stock_group_ob" },   
                            {master: "Currency", table: "currency_ob" }          
                          ];
                      
                          const results = [];
                      
                          for (const { master, table } of tables) {
                            try {
                              const countRes = await new sql.Request().query(
                                `SELECT COUNT(*) AS count FROM [${TALLY_DB}].[dbo].[${table}]`
                              );
                      
                              const colRes = await new sql.Request().query(
                                `SELECT * FROM [${TALLY_DB}].[dbo].[${table}] WHERE 1=0`
                              );
                                const colMetaRes = await new sql.Request().query(`
                                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
                                FROM [${TALLY_DB}].INFORMATION_SCHEMA.COLUMNS
                                WHERE TABLE_NAME = '${table}'
                              `);
                      
                            
                              const columnCount = Object.keys(colRes.recordset.columns).length;
                              const columnDetails = colMetaRes.recordset || [];
                      
                      
                              results.push({
                                master,
                                count: countRes.recordset[0].count,
                                fields: columnCount,
                                columns: columnDetails
                              });
                            } catch (err) {
                             servError(err,res)
                            }
                          }
                      
                          return dataFound(res, { Tally: results }, "Data Found");
                        } catch (e) {
                          servError(e, res);
                        }
                      };
              
    return {
        getDetailsData,
        getTallyDatabase
    }
}

    
export default lom();