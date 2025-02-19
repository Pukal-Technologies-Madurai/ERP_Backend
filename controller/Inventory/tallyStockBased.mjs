import { ISOString, parseJSON } from "../../helper_functions.mjs";
import { sentData, servError } from "../../res.mjs";
import sql from 'mssql';

const TallyStockBasedControll = () => {

    const getTallyStockJournalData = async (req, res) => {

        try {
            const { db } = req;
            const Fromdate = ISOString(req?.query?.Fromdate);
            const Todate = ISOString(req?.query?.Todate);
            const request = new sql.Request(db)
                .input('Fromdate', Fromdate)
                .input('Todate', Todate)
                .query(`
                    WITH CostCenter AS (
                        SELECT 
                            tally_id,
                    		cost_centre_name
                        FROM 
                            cost_centre_ob
                    ), Godown AS (
                        SELECT 
                            tally_id,
                            godown_name
                        FROM 
                            godown_ob
                    ), ItemDetails AS (
                        SELECT
                            tally_id,
                            stock_item_name
                        FROM 
                            stock_items_ob
                    ), SJ_Main AS (
                        SELECT 
                            tally_id,
                            journal_no,
                            stock_journal_date,
                            stock_journal_type_id,
                            stock_journal_bill_type,
                            invoice_no,
                            narration,
                            broker_id,
                            transporter_id,
                            load_man,
                            others_1,
                            others_2,
                            others_3,
                            others_4,
                            others_5,
                            others_6
                        FROM stock_journal_geninfo_ob
                        WHERE CONVERT(DATE, stock_journal_date) >= CONVERT(DATE, @Fromdate) 
                        AND CONVERT(DATE, stock_journal_date) <= CONVERT(DATE, @Todate)
                    ), SourceData AS (
                        SELECT 
                            tally_id,
                            stock_journal_tally_id,
                            journal_no,
                            journal_date,
                            source_consumt_item_id,
                            source_description,
                            source_consumt_goodown_id,
                            source_batch_Lot_No,
                            source_consumt_qty,
                            source_consumt_unit,
                            source_consumt_rate,
                            source_consumt_amt
                        FROM stock_journal_source_details_ob
                        WHERE CONVERT(DATE, journal_date) >= CONVERT(DATE, @Fromdate) 
                        AND CONVERT(DATE, journal_date) <= CONVERT(DATE, @Todate)
                    ), DestinationData AS (
                        SELECT 
                            tally_id,
                            stock_journal_tally_id,
                            journal_no,
                            journal_date,
                            destina_consumt_item_id,
                            destina_description,
                            destina_consumt_goodown_id,
                            destina_batch_Lot_No,
                            destina_consumt_qty,
                            destina_consumt_unit,
                            destina_consumt_rate,
                            destina_consumt_amt
                        FROM stock_journal_destination_details_ob
                        WHERE CONVERT(DATE, journal_date) >= CONVERT(DATE, @Fromdate) 
                        AND CONVERT(DATE, journal_date) <= CONVERT(DATE, @Todate)
                    )
                    SELECT 
                        sj.*,
                        COALESCE(broker.cost_centre_name, '-') as broker_name, 
                        COALESCE(transporter.cost_centre_name, '-') AS transporter_name,  
                        COALESCE(loadman.cost_centre_name, '-') AS loadman_name, 
                        COALESCE(othersone.cost_centre_name, '-') AS othersone_name, 
                        COALESCE(otherstwo.cost_centre_name, '-') AS otherstwo_name, 
                        COALESCE(othersthree.cost_centre_name, '-') AS othersthree_name, 
                        COALESCE(othersfour.cost_centre_name, '-') AS othersfour_name, 
                        COALESCE(othersfive.cost_centre_name, '-') AS othersfive_name, 
                        COALESCE(otherssix.cost_centre_name, '-') AS otherssix_name,
                        COALESCE(voucher.voucher_name, '') AS voucher_name,
                        COALESCE((
                            SELECT 
                                g.godown_name,
                                ii.stock_item_name,
                                source.*
                            FROM 
                                SourceData AS source
                            LEFT JOIN 
                                Godown AS g ON g.tally_id = source.source_consumt_goodown_id
                            LEFT JOIN
                                ItemDetails AS ii ON source.source_consumt_item_id = ii.tally_id 
                            WHERE 
                                source.tally_id = sj.tally_id
                            FOR JSON PATH
                        ), '[]') AS SourceDetails,
                        COALESCE((
                            SELECT 
                                g.godown_name,
                                ii.stock_item_name,
                                destination.*
                            FROM 
                                DestinationData AS destination
                            LEFT JOIN 
                                Godown AS g ON g.tally_id = destination.destina_consumt_goodown_id
                            LEFT JOIN
                                ItemDetails AS ii ON destination.destina_consumt_item_id = ii.tally_id
                            WHERE 
                                destination.tally_id = sj.tally_id
                            FOR JSON PATH
                        ), '[]') AS DestinationDetails
                    FROM 
                        SJ_Main AS sj
                        LEFT JOIN CostCenter AS broker
                        ON broker.tally_id = sj.broker_id
                        LEFT JOIN CostCenter AS transporter
                        ON transporter.tally_id = sj.transporter_id
                        LEFT JOIN CostCenter AS loadman
                        ON loadman.tally_id = sj.load_man
                        LEFT JOIN CostCenter AS othersone
                        ON othersone.tally_id = sj.others_1
                        LEFT JOIN CostCenter AS otherstwo
                        ON otherstwo.tally_id = sj.others_2
                        LEFT JOIN CostCenter AS othersthree
                        ON othersthree.tally_id = sj.others_3
                        LEFT JOIN CostCenter AS othersfour
                        ON othersfour.tally_id = sj.others_4
                        LEFT JOIN CostCenter AS othersfive
                        ON othersfive.tally_id = sj.others_5
                        LEFT JOIN CostCenter AS otherssix
                        ON otherssix.tally_id = sj.others_6
                        LEFT JOIN voucher_type_ob AS voucher
                        ON voucher.tally_id = sj.stock_journal_type_id
                    `);

            const result = await request;

            const extractedData = result.recordset.map(o => ({
                ...o,
                SourceDetails: JSON.parse(o.SourceDetails),
                DestinationDetails: JSON.parse(o.DestinationDetails)
            }));

            sentData(res, extractedData);

        } catch (e) {
            servError(e, res);
        }
    }

    const getTallyStockJournalDataExtended = async (req, res) => {
        try {
            const { db } = req;
            const tally_id = req?.query?.tally_id;

            const request = new sql.Request(db)
                .input('tally_id', tally_id)
                .query(`
                    WITH Godown AS (
                        SELECT 
                            tally_id,
                            godown_name
                        FROM 
                            godown_ob
                    ), ItemDetails AS (
                        SELECT
                            tally_id,
                            stock_item_name
                        FROM 
                            stock_items_ob
                    )
                    SELECT 
                        COALESCE((
                            SELECT 
                                g.godown_name,
                                ii.stock_item_name,
                                source.*
                            FROM 
                                stock_journal_source_details_ob AS source
                            LEFT JOIN 
                                Godown AS g ON g.tally_id = source.source_consumt_goodown_id
                            LEFT JOIN
                                ItemDetails AS ii ON source.source_consumt_item_id = ii.tally_id 
                            WHERE 
                                source.tally_id = @tally_id
                            FOR JSON PATH
                        ), '[]') AS SourceDetails,
                        COALESCE((
                            SELECT 
                                g.godown_name,
                                ii.stock_item_name,
                                destination.*
                            FROM 
                                stock_journal_destination_details_ob AS destination
                            LEFT JOIN 
                                Godown AS g ON g.tally_id = destination.destina_consumt_goodown_id
                            LEFT JOIN
                                ItemDetails AS ii ON destination.destina_consumt_item_id = ii.tally_id
                            WHERE 
                                destination.tally_id = @tally_id
                            FOR JSON PATH
                        ), '[]') AS DestinationDetails;               
                `);

            const result = await request;
            if (result.recordset.length === 0) {
                sentData(res, []);
                return;
            }

            const parseSourceDetails = parseJSON(result.recordset[0].SourceDetails);
            const parseDestinationDetails = parseJSON(result.recordset[0].DestinationDetails);
            const SourceDetails = parseSourceDetails.isJSON ? parseSourceDetails.data : [];
            const DestinationDetails = parseDestinationDetails.isJSON ? parseDestinationDetails.data : [];
            sentData(res, [{ SourceDetails, DestinationDetails }]);

        } catch (e) {
            servError(e, res);
        }
    }

    return {
        getTallyStockJournalData,
        getTallyStockJournalDataExtended
    }
}

export default TallyStockBasedControll();