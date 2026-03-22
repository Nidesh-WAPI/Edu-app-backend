const express = require('express');
const { verifyToken, requireRole } = require('../middleware/auth.middleware');
const {
  getSyllabuses, createSyllabus, updateSyllabus, deleteSyllabus,
  getClasses, createClass, updateClass, deleteClass,
  getSubjects, createSubject, updateSubject, deleteSubject,
} = require('../controllers/config.controller');

const router = express.Router();
router.use(verifyToken, requireRole('admin'));

router.route('/syllabuses').get(getSyllabuses).post(createSyllabus);
router.route('/syllabuses/:id').put(updateSyllabus).delete(deleteSyllabus);

router.route('/classes').get(getClasses).post(createClass);
router.route('/classes/:id').put(updateClass).delete(deleteClass);

router.route('/subjects').get(getSubjects).post(createSubject);
router.route('/subjects/:id').put(updateSubject).delete(deleteSubject);

module.exports = router;
