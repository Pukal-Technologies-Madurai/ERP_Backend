import sql from 'mssql'
import { servError, dataFound, noData, failed, success, invalidInput } from '../../res.mjs';
import { checkIsNumber } from '../../helper_functions.mjs';


const baseGroupMaster = () => {

    const getBaseGroup = async (req, res) => {

        try {
            const result = (await new sql.Request().execute('Base_Group_VW')).recordset

            if (result.length > 0) {
                dataFound(res, result)
            } else {
                noData(res)
            }

        } catch (e) {
            servError(res, e)
        }
    }

    const postBaseGroup = async (req, res) => {
        const { Base_Group_Name } = req.body;

        if (!Base_Group_Name) {
            return invalidInput(res, 'Base_Group_Name is required')
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 1);
            request.input('Base_Group_Id', 0);
            request.input('Base_Group_Name', Base_Group_Name);

            const result = await request.execute('Base_Group_SP');

            if (result.recordset.length > 0) {
                success(res, 'Base Group Created')
            } else {
                failed(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const editBaseGroup = async (req, res) => {
        const { Base_Group_Id, Base_Group_Name } = req.body;

        if (!checkIsNumber(Base_Group_Id) || !Base_Group_Name) {
            return invalidInput(res, 'Base_Group_Id, Base_Group_Name is required')
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 2);
            request.input('Base_Group_Id', Base_Group_Id);
            request.input('Base_Group_Name', Base_Group_Name);

            const result = await request.execute('Base_Group_SP');

            if (result.rowsAffected[0] > 0) {
                success(res, 'Changes Saved!')
            } else {
                failed(res, 'Failed to save')
            }

        } catch (e) {
            servError(e, res)
        }
    }

    const deleteBaseGroup = async (req, res) => {
        const { Base_Group_Id } = req.body;

        if (!checkIsNumber(Base_Group_Id)) {
            return invalidInput(res, 'Base_Group_Id, is required')
        }

        try {
            const request = new sql.Request();
            request.input('Mode', 3);
            request.input('Base_Group_Id', Base_Group_Id);
            request.input('Base_Group_Name', 0);

            const result = await request.execute('Base_Group_SP');

            if (result.rowsAffected[0] > 0) {
                success(res, 'Deleted')
            } else {
                failed(res)
            }

        } catch (e) {
            servError(e, res)
        }
    }




    const stockGroup=async(req,res)=>{
        try {
    const { groupName = '' } = req.body;
  
    
    const result = await new sql.Request()  
      .input('Group_Name', sql.NVarChar(150), groupName)
      .execute('Item_Group_List');
      if (result.recordset.length > 0) {
                    dataFound(res, result.recordset)
                } else {
                    noData(res)
                }
    // res.json({ success: true, data: result.recordset });
  } catch (error) {
   servError(error,res)
  }
    }

    const stockItemGroup=async(req,res)=>{
         try {
    const { stockGroupId } = req.body;

    
    const result = await new sql.Request()
      .input('stock_group_id', sql.Int, stockGroupId || 0)
      .execute('Item_Group_Stock_Item_List');
    
     if (result.recordset.length > 0) {
                    dataFound(res, result.recordset)
                } else {
                    noData(res)
                }
  } catch (error) {
    servError(error,res)
  }
    }

    const stockItemGroupList=async(req,res)=>{
         try {
    const { fromDate, toDate, stockGroupId, itemIds = [] } = req.body;
    

    
    let itemFilter = '';
    if (itemIds.length > 0) {
      const itemList = itemIds.map(id => `'${id}'`).join(',');
      itemFilter = `AND S.Dest_Item_Id IN (${itemList}) AND S.Sour_Item_Id IN (${itemList})`;
    }
    
    const destinationQuery = `
      SELECT 
        SJ.PR_Id as stock_jou_id,
        SJ.PR_Inv_Id as journal_no,
        SJ.Process_date as stock_journal_date,
        S.PRD_Id as stock_journ_dest_id,
        S.Dest_Item_Id as destina_consumt_item_id,
        S.Dest_Goodown_Id as destina_consumt_goodown_id,
        S.Dest_Qty as destina_consumt_qty,
        S.Dest_Unit as destina_consumt_unit,
        COALESCE(S.Dest_Rate, 0) as destina_consumt_rate,
        COALESCE(S.Dest_Amt, 0) as destina_consumt_amt,
        ST.Product_Name as stock_item_name,
        G.Godown_Name as godown_name,
        'Destination' as transaction_type
      FROM tbl_Processing_Gen_Info SJ
      INNER JOIN tbl_Processing_Destin_Details S ON SJ.PR_Id = S.PR_Id
      INNER JOIN tbl_Product_Master ST ON S.Dest_Item_Id = ST.Product_Id
      INNER JOIN tbl_Godown_Master G ON S.Dest_Goodown_Id = G.Godown_Id
      CROSS APPLY Item_Group_Details_List_ALL_Fn() IG
      WHERE S.Dest_Item_Id = IG.Materail_Id
        AND SJ.Process_date >= @fromDate
        AND SJ.Process_date <= @toDate
        ${itemIds.length > 0 ? 'AND S.Dest_Item_Id IN (' + itemIds.map(id => `'${id}'`).join(',') + ')' : ''}
    `;
    
    const sourceQuery = `
      SELECT 
        SJ.PR_Id as stock_jou_id,
        SJ.PR_Inv_Id as journal_no,
        SJ.Process_date as stock_journal_date,
        S.PRS_Id as stock_journ_sour_id,
        S.Sour_Item_Id AS source_consumt_item_id,
        S.Sour_Goodown_Id as source_consumt_goodown_id,
        S.Sour_Qty as source_consumt_qty,
        S.Sour_Unit as source_consumt_unit,
        COALESCE(S.Sour_Rate, 0) as source_consumt_rate,
        COALESCE(S.Sour_Amt, 0) as Source_consumt_amt,
        ST.Product_Name as stock_item_name,
        G.Godown_Name as godown_name,
        'Source' as transaction_type
      FROM tbl_Processing_Gen_Info SJ
      INNER JOIN tbl_Processing_Source_Details S ON SJ.PR_Id = S.PR_Id
      INNER JOIN tbl_Product_Master ST ON S.Sour_Item_Id = ST.Product_Id
      INNER JOIN tbl_Godown_Master G ON S.Sour_Goodown_Id = G.Godown_Id
      CROSS APPLY Item_Group_Details_List_ALL_Fn() IG
      WHERE S.Sour_Item_Id = IG.Materail_Id
        AND SJ.Process_date >= @fromDate
        AND SJ.Process_date <= @toDate
        ${itemIds.length > 0 ? 'AND S.Sour_Item_Id IN (' + itemIds.map(id => `'${id}'`).join(',') + ')' : ''}
    `;
    
    const request = new sql.Request()
    .input('fromDate', sql.Date, fromDate)
    .input('toDate', sql.Date, toDate);
  
    const [destinationResult, sourceResult] = await Promise.all([
      request.query(destinationQuery),
      request.query(sourceQuery)
    ]);
    
    const allTransactions = [
      ...(destinationResult.recordset || []),
      ...(sourceResult.recordset || [])
    ];
    
    allTransactions.sort((a, b) => new Date(a.stock_journal_date) - new Date(b.stock_journal_date));
    
    res.json({ 
      success: true, 
      data: {
        source: sourceResult.recordset || [],
        destination: destinationResult.recordset || []
      }
    });
  } catch (error) {
    servError(error,res)
  }
    }

    const stockGroupGet=async(req,res)=>{
          try {
          const stock = (await new sql.Request()
                    .query(`
                       select distinct(Stock_Group)  from tbl_Stock_LOS
                            `)
                ).recordset;
                // AND
                // Company_id = @Comp
    
                if (stock.length > 0) {
                    dataFound(res, stock)
                } else {
                    noData(res)
                }
            } catch (e) {
                servError(e, res)
            }
        }

const arrivalList = async (req, res) => {
  try {
    const { fromDate, toDate, stockGroupId, itemIds = [] } = req.body;
    
    
    const request = await new sql.Request()
    .input('fromDate', sql.Date, fromDate)
    .input('toDate', sql.Date, toDate);
    
    let itemFilter = '';
    if (itemIds.length > 0) {
      const itemList = itemIds.map(id => `'${id}'`).join(',');
      itemFilter = `AND S.Product_Id IN (${itemList})`;
    }
    
    const arrivalQuery = `
      SELECT 
        S.Arr_Id as Id,
        S.Arrival_Date,
        S.Arr_Id,
        S.Product_Id,
        S.To_Location as Arrival_godown_id,
        S.QTY as Arr_qty,
        S.Units as Units,
        COALESCE(S.Gst_Rate, 0) as Rate,
        COALESCE(S.Taxable_Value, 0) as Taxable_Value,
        ST.Product_Name as stock_item_name,
        G.Godown_Name as godown_name
      FROM tbl_Trip_Arrival S
      INNER JOIN tbl_Product_Master ST ON S.Product_Id = ST.Product_Id
      INNER JOIN tbl_Godown_Master G ON S.To_Location = G.Godown_Id
      CROSS APPLY Item_Group_Details_List_ALL_Fn() IG
      WHERE S.Product_Id = IG.Materail_Id
        AND S.Arrival_Date >= @fromDate
        AND S.Arrival_Date <= @toDate
        ${itemFilter}
      ORDER BY S.Arrival_Date DESC
    `;
    
    const result = await request.query(arrivalQuery);
    //  dataFound(res, result.recordset)
    if (result.recordset.length > 0) {
                    dataFound(res, result.recordset)
                } else {
                    noData(res)
                }
  } catch (error) {
    servError(error,res)
  }
};

// const updateProcessingRates = async (req, res) => {
//     try {
//         const { 
//             type,                  
//             sourceRate,
//             destinationRate,
//             FromDate, 
//             ToDate, 
//             StockGroupId, 
//             ItemId 
//         } = req.body;

     
//         if (!type || !['source', 'destination', 'both'].includes(type)) {
//             return failed(res, 'Invalid type. Must be "source", "destination", or "both"');
//         }

    
//         if (!FromDate) {
//             return failed(res, 'From date is required');
//         }

//         if (!ToDate) {
//             return failed(res, 'To date is required');
//         }

//         if (new Date(FromDate) > new Date(ToDate)) {
//             return failed(res, 'From date cannot be greater than To date');
//         }

  
//         if (type === 'source' || type === 'destination') {

//             const rate = type === 'source' ? sourceRate : destinationRate;
//             if (!rate || rate <= 0) {
//                 return failed(res, `${type === 'source' ? 'Source' : 'Destination'} rate is required and must be greater than 0`);
//             }

//             let query = '';
//             const request = new sql.Request();

//             if (type === 'source') {
//                 query = `
//                     UPDATE S 
//                     SET 
//                         S.Sour_Rate = @Rate,
//                         S.Sour_Amt = S.Sour_Qty * @Rate
//                     FROM tbl_Processing_Gen_Info SJ
//                     INNER JOIN tbl_Processing_Source_Details S ON SJ.PR_Id = S.PR_Id
//                     CROSS APPLY Item_Group_Details_List_ALL_Fn() IG
//                     WHERE 
//                         S.Sour_Item_Id = IG.Materail_Id
//                         AND SJ.Process_date >= @FromDate 
//                         AND SJ.Process_date <= @ToDate
//                 `;
//             } else {
//                 query = `
//                     UPDATE S 
//                     SET 
//                         S.Dest_Rate = @Rate,
//                         S.Dest_Amt = S.Dest_Qty * @Rate
//                     FROM tbl_Processing_Gen_Info SJ
//                     INNER JOIN tbl_Processing_Destin_Details S ON SJ.PR_Id = S.PR_Id
//                     CROSS APPLY Item_Group_Details_List_ALL_Fn() IG
//                     WHERE 
//                         S.Dest_Item_Id = IG.Materail_Id
//                         AND SJ.Process_date >= @FromDate 
//                         AND SJ.Process_date <= @ToDate
//                 `;
//             }

//             request.input('Rate', sql.Decimal(18, 2), rate);
//             request.input('FromDate', sql.Date, new Date(FromDate));
//             request.input('ToDate', sql.Date, new Date(ToDate));

//             if (StockGroupId && StockGroupId !== '0') {
//                 query += ` AND IG.Item_Group_Id = @StockGroupId`;
//                 request.input('StockGroupId', sql.NVarChar, StockGroupId);
//             }

//             if (ItemId && ItemId !== '0') {
//                 if (type === 'source') {
//                     query += ` AND S.Sour_Item_Id = @ItemId`;
//                 } else {
//                     query += ` AND S.Dest_Item_Id = @ItemId`;
//                 }
//                 request.input('ItemId', sql.NVarChar, ItemId);
//             }

//             const result = await request.query(query);

//             return success(res, `${type === 'source' ? 'Source' : 'Destination'} rates updated successfully`, {
//                 type: type,
//                 rowsAffected: result.rowsAffected[0],
//                 rate: rate,
//                 fromDate: FromDate,
//                 toDate: ToDate,
//                 filters: {
//                     stockGroupId: StockGroupId || 'All',
//                     itemId: ItemId || 'All'
//                 }
//             });
//         }

     
//         if (type === 'both') {
//             if (!sourceRate || sourceRate <= 0) {
//                 return failed(res, 'Source rate is required and must be greater than 0');
//             }

//             if (!destinationRate || destinationRate <= 0) {
//                 return failed(res, 'Destination rate is required and must be greater than 0');
//             }

//             const transaction = new sql.Transaction();
//             await transaction.begin();

//             try {
              
//                 let sourceQuery = `
//                     UPDATE S 
//                     SET 
//                         S.Sour_Rate = @SourceRate,
//                         S.Sour_Amt = S.Sour_Qty * @SourceRate
//                     FROM tbl_Processing_Gen_Info SJ
//                     INNER JOIN tbl_Processing_Source_Details S ON SJ.PR_Id = S.PR_Id
//                     CROSS APPLY Item_Group_Details_List_ALL_Fn() IG
//                     WHERE 
//                         S.Sour_Item_Id = IG.Materail_Id
//                         AND SJ.Process_date >= @FromDate 
//                         AND SJ.Process_date <= @ToDate
//                 `;

                
//                 let destQuery = `
//                     UPDATE S 
//                     SET 
//                         S.Dest_Rate = @DestinationRate,
//                         S.Dest_Amt = S.Dest_Qty * @DestinationRate
//                     FROM tbl_Processing_Gen_Info SJ
//                     INNER JOIN tbl_Processing_Destin_Details S ON SJ.PR_Id = S.PR_Id
//                     CROSS APPLY Item_Group_Details_List_ALL_Fn() IG
//                     WHERE 
//                         S.Dest_Item_Id = IG.Materail_Id
//                         AND SJ.Process_date >= @FromDate 
//                         AND SJ.Process_date <= @ToDate
//                 `;

//                 const sourceRequest = new sql.Request(transaction);
//                 const destRequest = new sql.Request(transaction);

//                 sourceRequest.input('SourceRate', sql.Decimal(18, 2), sourceRate);
//                 sourceRequest.input('FromDate', sql.Date, new Date(FromDate));
//                 sourceRequest.input('ToDate', sql.Date, new Date(ToDate));

//                 destRequest.input('DestinationRate', sql.Decimal(18, 2), destinationRate);
//                 destRequest.input('FromDate', sql.Date, new Date(FromDate));
//                 destRequest.input('ToDate', sql.Date, new Date(ToDate));

              
//                 if (StockGroupId && StockGroupId !== '0') {
//                     sourceQuery += ` AND IG.Item_Group_Id = @StockGroupId`;
//                     destQuery += ` AND IG.Item_Group_Id = @StockGroupId`;
//                     sourceRequest.input('StockGroupId', sql.NVarChar, StockGroupId);
//                     destRequest.input('StockGroupId', sql.NVarChar, StockGroupId);
//                 }

//                 if (ItemId && ItemId !== '0') {
//                     sourceQuery += ` AND S.Sour_Item_Id = @ItemId`;
//                     destQuery += ` AND S.Dest_Item_Id = @ItemId`;
//                     sourceRequest.input('ItemId', sql.NVarChar, ItemId);
//                     destRequest.input('ItemId', sql.NVarChar, ItemId);
//                 }

              
//                 const sourceResult = await sourceRequest.query(sourceQuery);
//                 const destResult = await destRequest.query(destQuery);

//                 await transaction.commit();

//                 return success(res, 'Both source and destination rates updated successfully', {
//                     type: 'both',
//                     sourceRowsAffected: sourceResult.rowsAffected[0],
//                     destinationRowsAffected: destResult.rowsAffected[0],
//                     totalRowsAffected: sourceResult.rowsAffected[0] + destResult.rowsAffected[0],
//                     sourceRate: sourceRate,
//                     destinationRate: destinationRate,
//                     fromDate: FromDate,
//                     toDate: ToDate,
//                     filters: {
//                         stockGroupId: StockGroupId || 'All',
//                         itemId: ItemId || 'All'
//                     }
//                 });

//             } catch (err) {
//                 await transaction.rollback();
//                 throw err;
//             }
//         }

//     } catch (e) {
//         servError(e, res);
//     }
// };

// const updateProcessingRates = async (req, res) => {
//     try {
//         const { 
//             type,                    // 'source', 'destination', or 'both'
//             sourceRate,
//             destinationRate,
//             FromDate, 
//             ToDate, 
//             StockGroupId, 
//             ItemId,
//             // Individual row update fields
//             stock_journ_sour_id,     // For individual source row update
//             stock_journ_dest_id      // For individual destination row update
//         } = req.body;

//         // Check if this is an individual row update
//         const isIndividualUpdate = (type === 'source' && stock_journ_sour_id) || 
//                                    (type === 'destination' && stock_journ_dest_id);

//         // Validation for individual update
//         if (isIndividualUpdate) {
//             const rate = type === 'source' ? sourceRate : destinationRate;
//             // if (!rate || rate <= 0) {
//             //     return failed(res, `${type === 'source' ? 'Source' : 'Destination'} rate is required and must be greater than 0`);
//             // }

//             let query = '';
//             const request = new sql.Request();

//             if (type === 'source') {
//                 query = `
//                     UPDATE S 
//                     SET 
//                         S.Sour_Rate = @Rate,
//                         S.Sour_Amt = S.Sour_Qty * @Rate
//                     FROM tbl_Processing_Source_Details S
//                     WHERE S.PRS_ID = @stock_journ_sour_id
//                 `;
//                 request.input('stock_journ_sour_id', sql.Int, stock_journ_sour_id);
//             } else {
//                 query = `
//                     UPDATE S 
//                     SET 
//                         S.Dest_Rate = @Rate,
//                         S.Dest_Amt = S.Dest_Qty * @Rate
//                     FROM tbl_Processing_Destin_Details S
//                     WHERE S.PRD_ID = @stock_journ_dest_id
//                 `;
//                 request.input('stock_journ_dest_id', sql.Int, stock_journ_dest_id);
//             }

//             request.input('Rate', sql.Decimal(18, 2), rate);
//             const result = await request.query(query);

//             if (result.rowsAffected[0] === 0) {
//                 return failed(res, 'No record found with the given ID');
//             }

//             return success(res, `${type === 'source' ? 'Source' : 'Destination'} rate updated successfully`, {
//                 type: type,
//                 rowsAffected: result.rowsAffected[0],
//                 rate: rate,
//                 updatedId: type === 'source' ? stock_journ_sour_id : stock_journ_dest_id
//             });
//         }

//         // If not individual update, validate dates for bulk update
//         if (!FromDate) {
//             return failed(res, 'From date is required');
//         }

//         if (!ToDate) {
//             return failed(res, 'To date is required');
//         }

//         if (new Date(FromDate) > new Date(ToDate)) {
//             return failed(res, 'From date cannot be greater than To date');
//         }

//         // Validate type
//         if (!type || !['source', 'destination', 'both'].includes(type)) {
//             return failed(res, 'Invalid type. Must be "source", "destination", or "both"');
//         }

//         // Handle bulk update (source or destination)
//         if (type === 'source' || type === 'destination') {
//             const rate = type === 'source' ? sourceRate : destinationRate;
//             // if (!rate || rate <= 0) {
//             //     return failed(res, `${type === 'source' ? 'Source' : 'Destination'} rate is required and must be greater than 0`);
//             // }

//             let query = '';
//             const request = new sql.Request();

//             if (type === 'source') {
//                 query = `
//                     UPDATE S 
//                     SET 
//                         S.Sour_Rate = @Rate,
//                         S.Sour_Amt = S.Sour_Qty * @Rate
//                     FROM tbl_Processing_Gen_Info SJ
//                     INNER JOIN tbl_Processing_Source_Details S ON SJ.PR_Id = S.PR_Id
//                     CROSS APPLY Item_Group_Details_List_ALL_Fn() IG
//                     WHERE 
//                         S.Sour_Item_Id = IG.Materail_Id
//                         AND SJ.Process_date >= @FromDate 
//                         AND SJ.Process_date <= @ToDate
//                 `;
//             } else {
//                 query = `
//                     UPDATE S 
//                     SET 
//                         S.Dest_Rate = @Rate,
//                         S.Dest_Amt = S.Dest_Qty * @Rate
//                     FROM tbl_Processing_Gen_Info SJ
//                     INNER JOIN tbl_Processing_Destin_Details S ON SJ.PR_Id = S.PR_Id
//                     CROSS APPLY Item_Group_Details_List_ALL_Fn() IG
//                     WHERE 
//                         S.Dest_Item_Id = IG.Materail_Id
//                         AND SJ.Process_date >= @FromDate 
//                         AND SJ.Process_date <= @ToDate
//                 `;
//             }

//             request.input('Rate', sql.Decimal(18, 2), rate);
//             request.input('FromDate', sql.Date, new Date(FromDate));
//             request.input('ToDate', sql.Date, new Date(ToDate));

//             if (StockGroupId && StockGroupId !== '0') {
//                 query += ` AND IG.Item_Group_Id = @StockGroupId`;
//                 request.input('StockGroupId', sql.NVarChar, StockGroupId);
//             }

//             if (ItemId && ItemId !== '0' && ItemId !== 'null') {
//                 if (type === 'source') {
//                     query += ` AND S.Sour_Item_Id = @ItemId`;
//                 } else {
//                     query += ` AND S.Dest_Item_Id = @ItemId`;
//                 }
//                 request.input('ItemId', sql.NVarChar, ItemId);
//             }

//             const result = await request.query(query);

//             return success(res, `${type === 'source' ? 'Source' : 'Destination'} rates updated successfully`, {
//                 type: type,
//                 rowsAffected: result.rowsAffected[0],
//                 rate: rate,
//                 fromDate: FromDate,
//                 toDate: ToDate,
//                 filters: {
//                     stockGroupId: StockGroupId || 'All',
//                     itemId: ItemId || 'All'
//                 }
//             });
//         }

//         // Handle bulk both updates in a transaction
//         if (type === 'both') {
//             // if (!sourceRate || sourceRate <= 0) {
//             //     return failed(res, 'Source rate is required and must be greater than 0');
//             // }

//             // if (!destinationRate || destinationRate) {
//             //     return failed(res, 'Destination rate is required and must be greater than 0');
//             // }

//             const transaction = new sql.Transaction();
//             await transaction.begin();

//             try {
//                 let sourceQuery = `
//                     UPDATE S 
//                     SET 
//                         S.Sour_Rate = @SourceRate,
//                         S.Sour_Amt = S.Sour_Qty * @SourceRate
//                     FROM tbl_Processing_Gen_Info SJ
//                     INNER JOIN tbl_Processing_Source_Details S ON SJ.PR_Id = S.PR_Id
//                     CROSS APPLY Item_Group_Details_List_ALL_Fn() IG
//                     WHERE 
//                         S.Sour_Item_Id = IG.Materail_Id
//                         AND SJ.Process_date >= @FromDate 
//                         AND SJ.Process_date <= @ToDate
//                 `;

//                 let destQuery = `
//                     UPDATE S 
//                     SET 
//                         S.Dest_Rate = @DestinationRate,
//                         S.Dest_Amt = S.Dest_Qty * @DestinationRate
//                     FROM tbl_Processing_Gen_Info SJ
//                     INNER JOIN tbl_Processing_Destin_Details S ON SJ.PR_Id = S.PR_Id
//                     CROSS APPLY Item_Group_Details_List_ALL_Fn() IG
//                     WHERE 
//                         S.Dest_Item_Id = IG.Materail_Id
//                         AND SJ.Process_date >= @FromDate 
//                         AND SJ.Process_date <= @ToDate
//                 `;

//                 const sourceRequest = new sql.Request(transaction);
//                 const destRequest = new sql.Request(transaction);

//                 sourceRequest.input('SourceRate', sql.Decimal(18, 2), sourceRate);
//                 sourceRequest.input('FromDate', sql.Date, new Date(FromDate));
//                 sourceRequest.input('ToDate', sql.Date, new Date(ToDate));

//                 destRequest.input('DestinationRate', sql.Decimal(18, 2), destinationRate);
//                 destRequest.input('FromDate', sql.Date, new Date(FromDate));
//                 destRequest.input('ToDate', sql.Date, new Date(ToDate));

//                 if (StockGroupId && StockGroupId !== '0') {
//                     sourceQuery += ` AND IG.Item_Group_Id = @StockGroupId`;
//                     destQuery += ` AND IG.Item_Group_Id = @StockGroupId`;
//                     sourceRequest.input('StockGroupId', sql.NVarChar, StockGroupId);
//                     destRequest.input('StockGroupId', sql.NVarChar, StockGroupId);
//                 }

//                 if (ItemId && ItemId !== '0' && ItemId !== 'null') {
//                     sourceQuery += ` AND S.Sour_Item_Id = @ItemId`;
//                     destQuery += ` AND S.Dest_Item_Id = @ItemId`;
//                     sourceRequest.input('ItemId', sql.NVarChar, ItemId);
//                     destRequest.input('ItemId', sql.NVarChar, ItemId);
//                 }

//                 const sourceResult = await sourceRequest.query(sourceQuery);
//                 const destResult = await destRequest.query(destQuery);

//                 await transaction.commit();

//                 return success(res, 'Both source and destination rates updated successfully', {
//                     type: 'both',
//                     sourceRowsAffected: sourceResult.rowsAffected[0],
//                     destinationRowsAffected: destResult.rowsAffected[0],
//                     totalRowsAffected: sourceResult.rowsAffected[0] + destResult.rowsAffected[0],
//                     sourceRate: sourceRate,
//                     destinationRate: destinationRate,
//                     fromDate: FromDate,
//                     toDate: ToDate,
//                     filters: {
//                         stockGroupId: StockGroupId || 'All',
//                         itemId: ItemId || 'All'
//                     }
//                 });

//             } catch (err) {
//                 await transaction.rollback();
//                 throw err;
//             }
//         }

//     } catch (e) {
//         servError(e, res);
//     }
// };

// const updateArrivalList = async (req, res) => {
//     try {
//         const { 
//             type,                
//             gstRate,            
//             FromDate, 
//             ToDate, 
//             StockGroupId, 
//             ItemId,
//             arrival_id            
//         } = req.body;

//         // Check if this is an individual row update
//         const isIndividualUpdate = (type === 'individual' && arrival_id);

//         // Validation for individual update
//         if (isIndividualUpdate) {
          

//             if (!arrival_id) {
//                 return failed(res, 'Arrival ID is required for individual update');
//             }

//             const query = `
//                 UPDATE tbl_Trip_Arrival 
//                 SET 
//                     Gst_Rate = @GstRate,
//                     Taxable_Value = QTY * @GstRate,
//                     Total_Value = QTY * @GstRate
//                 WHERE Arr_Id = @Arrival_Id
//             `;

//             const request = new sql.Request();
//             request.input('GstRate', sql.Decimal(18, 2), gstRate);
//             request.input('Arrival_Id', sql.Int, arrival_id);

//             const result = await request.query(query);

//             if (result.rowsAffected[0] === 0) {
//                 return failed(res, 'No record found with the given Arrival ID');
//             }

//             return success(res, 'GST rate updated successfully', {
//                 type: 'individual',
//                 rowsAffected: result.rowsAffected[0],
//                 gstRate: gstRate,
//                 updatedId: arrival_id
//             });
//         }

//         // Validation for bulk update
//         if (!FromDate) {
//             return failed(res, 'From date is required');
//         }

//         if (!ToDate) {
//             return failed(res, 'To date is required');
//         }

//         if (new Date(FromDate) > new Date(ToDate)) {
//             return failed(res, 'From date cannot be greater than To date');
//         }

//         if (!gstRate || gstRate <= 0) {
//             return failed(res, 'GST rate is required and must be greater than 0');
//         }

//         // Build bulk update query
//         let query = `
//             UPDATE S 
//             SET 
//                 S.Gst_Rate = @GstRate,
//                 S.Taxable_Value = S.QTY * @GstRate,
//                 S.Total_Value = S.QTY * @GstRate
//             FROM tbl_Trip_Arrival S
//             CROSS APPLY Item_Group_Details_List_ALL_Fn() IG
//             WHERE 
//                 S.Product_Id = IG.Materail_Id
//                 AND S.Arrival_Date >= @FromDate 
//                 AND S.Arrival_Date <= @ToDate
//         `;

//         const request = new sql.Request();
//         request.input('GstRate', sql.Decimal(18, 2), gstRate);
//         request.input('FromDate', sql.Date, new Date(FromDate));
//         request.input('ToDate', sql.Date, new Date(ToDate));

//         // Add optional filters
//         if (StockGroupId && StockGroupId !== '0' && StockGroupId !== 'null') {
//             query += ` AND IG.Item_Group_Id = @StockGroupId`;
//             request.input('StockGroupId', sql.NVarChar, StockGroupId);
//         }

//         if (ItemId && ItemId !== '0' && ItemId !== 'null') {
//             query += ` AND S.Product_Id = @ItemId`;
//             request.input('ItemId', sql.NVarChar, ItemId);
//         }

//         // Execute bulk update
//         const result = await request.query(query);

//         if (result.rowsAffected[0] === 0) {
//             return success(res, 'No records found matching the criteria', {
//                 type: 'bulk',
//                 rowsAffected: 0,
//                 message: 'No records found in the specified date range'
//             });
//         }

//         return success(res, 'GST rates updated successfully', {
//             type: 'bulk',
//             rowsAffected: result.rowsAffected[0],
//             gstRate: gstRate,
//             fromDate: FromDate,
//             toDate: ToDate,
//             filters: {
//                 stockGroupId: StockGroupId || 'All',
//                 itemId: ItemId || 'All'
//             }
//         });

//     } catch (e) {
//         servError(e, res);
//     }
// };

// const updateOverAllGroupUpdate = async (req, res) => {
//     try {
//         const { 
//             FromDate, 
//             ToDate, 
//             Item_Group 
//         } = req.body;

  
//         if (!FromDate) {
//             return failed(res, 'From date is required');
//         }

//         if (!ToDate) {
//             return failed(res, 'To date is required');
//         }

//         if (new Date(FromDate) > new Date(ToDate)) {
//             return failed(res, 'From date cannot be greater than To date');
//         }

       
//         const itemGroup = (Item_Group && Item_Group !== '0' && Item_Group !== 0) ? Item_Group : 0;


//         const request = new sql.Request();
        

//         request.input('Fromdate', sql.VarChar(50), FromDate);
//         request.input('Todate', sql.VarChar(50), ToDate);
//         request.input('Item_Group', sql.BigInt, itemGroup);

       
//         const result = await request.execute('Stock_Journal_Rate_Update');

        
//         if (result && result.returnValue === 0) {
//             return success(res, 'Stock journal rates updated successfully', {
//                 fromDate: FromDate,
//                 toDate: ToDate,
//                 itemGroup: itemGroup === 0 ? 'All Groups' : itemGroup,
//                 rowsAffected: result.rowsAffected || 0,
//                 output: result.recordset || []
//             });
//         } else {
//             return failed(res, 'Failed to update stock journal rates');
//         }

//     } catch (e) {
//         console.error('Error in updateStockJournalRate:', e);
//         servError(e, res);
//     }
// };



    return {
        getBaseGroup,
        postBaseGroup,
        editBaseGroup,
        deleteBaseGroup,
        // stockGroup,
        // stockItemGroup,
        // stockItemGroupList,
        // stockGroupGet,
        // arrivalList,
        // updateProcessingRates,
        // updateArrivalList,
        // updateOverAllGroupUpdate
    }
}

export default baseGroupMaster()