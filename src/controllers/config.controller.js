const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const ApiError = require('../utils/ApiError');
const Syllabus = require('../models/Syllabus.model');
const ClassLevel = require('../models/ClassLevel.model');
const Subject = require('../models/Subject.model');

// ── Syllabus ────────────────────────────────────────────────────────────────
const getSyllabuses = asyncHandler(async (req, res) => {
  const syllabuses = await Syllabus.find().sort({ name: 1 });
  res.json(new ApiResponse(200, 'Syllabuses fetched', syllabuses));
});

const createSyllabus = asyncHandler(async (req, res) => {
  const { name, code, description } = req.body;
  if (!name || !code) throw new ApiError(400, 'Name and code are required');
  const syllabus = await Syllabus.create({ name, code, description });
  res.status(201).json(new ApiResponse(201, 'Syllabus created', syllabus));
});

const updateSyllabus = asyncHandler(async (req, res) => {
  const syllabus = await Syllabus.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!syllabus) throw new ApiError(404, 'Syllabus not found');
  res.json(new ApiResponse(200, 'Syllabus updated', syllabus));
});

const deleteSyllabus = asyncHandler(async (req, res) => {
  const syllabus = await Syllabus.findByIdAndDelete(req.params.id);
  if (!syllabus) throw new ApiError(404, 'Syllabus not found');
  res.json(new ApiResponse(200, 'Syllabus deleted'));
});

// ── Classes ──────────────────────────────────────────────────────────────────
const getClasses = asyncHandler(async (req, res) => {
  const filter = req.query.syllabus ? { syllabus: req.query.syllabus } : {};
  const classes = await ClassLevel.find(filter).populate('syllabus', 'name code').sort({ grade: 1 });
  res.json(new ApiResponse(200, 'Classes fetched', classes));
});

const createClass = asyncHandler(async (req, res) => {
  const { name, grade, syllabus } = req.body;
  if (!name || !grade || !syllabus) throw new ApiError(400, 'Name, grade and syllabus are required');
  const classLevel = await ClassLevel.create({ name, grade, syllabus });
  await classLevel.populate('syllabus', 'name code');
  res.status(201).json(new ApiResponse(201, 'Class created', classLevel));
});

const updateClass = asyncHandler(async (req, res) => {
  const classLevel = await ClassLevel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('syllabus', 'name code');
  if (!classLevel) throw new ApiError(404, 'Class not found');
  res.json(new ApiResponse(200, 'Class updated', classLevel));
});

const deleteClass = asyncHandler(async (req, res) => {
  const classLevel = await ClassLevel.findByIdAndDelete(req.params.id);
  if (!classLevel) throw new ApiError(404, 'Class not found');
  res.json(new ApiResponse(200, 'Class deleted'));
});

// ── Subjects ─────────────────────────────────────────────────────────────────
const getSubjects = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.syllabus) filter.syllabus = req.query.syllabus;
  const subjects = await Subject.find(filter).populate('syllabus', 'name code').populate('classLevels', 'name grade').sort({ name: 1 });
  res.json(new ApiResponse(200, 'Subjects fetched', subjects));
});

const createSubject = asyncHandler(async (req, res) => {
  const { name, code, syllabus, classLevels } = req.body;
  if (!name || !code || !syllabus) throw new ApiError(400, 'Name, code and syllabus are required');
  const subject = await Subject.create({ name, code, syllabus, classLevels: classLevels || [] });
  await subject.populate('syllabus', 'name code');
  res.status(201).json(new ApiResponse(201, 'Subject created', subject));
});

const updateSubject = asyncHandler(async (req, res) => {
  const subject = await Subject.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('syllabus', 'name code').populate('classLevels', 'name grade');
  if (!subject) throw new ApiError(404, 'Subject not found');
  res.json(new ApiResponse(200, 'Subject updated', subject));
});

const deleteSubject = asyncHandler(async (req, res) => {
  const subject = await Subject.findByIdAndDelete(req.params.id);
  if (!subject) throw new ApiError(404, 'Subject not found');
  res.json(new ApiResponse(200, 'Subject deleted'));
});

module.exports = {
  getSyllabuses, createSyllabus, updateSyllabus, deleteSyllabus,
  getClasses, createClass, updateClass, deleteClass,
  getSubjects, createSubject, updateSubject, deleteSubject,
};
