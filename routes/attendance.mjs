import express from 'express';
import newAttendance from '../controller/Attendance/newAttendance.mjs';
import fingerPrintAttendance from '../controller/Attendance/fingerPrintAttendance.mjs';
import salesPersonVisitLogs from '../controller/Attendance/salesPersonVisitLogs.mjs';
const AttendanceRouter = express.Router();


AttendanceRouter.get('/attendance', newAttendance.getMyLastAttendance);
AttendanceRouter.get('/attendance/history', newAttendance.getAttendanceHistory);
AttendanceRouter.post('/attendance', newAttendance.addAttendance);
AttendanceRouter.put('/attendance', newAttendance.closeAttendance);
// AttendanceRouter.delete('/attendance', newAttendance.closeAttendance);

AttendanceRouter.get('/fingerPrintAttendance', fingerPrintAttendance.getAttendance);


AttendanceRouter.get('/visitLogs', salesPersonVisitLogs.getVisitedLogs);
AttendanceRouter.post('/visitLogs', salesPersonVisitLogs.postVisitLogs);

export default AttendanceRouter;