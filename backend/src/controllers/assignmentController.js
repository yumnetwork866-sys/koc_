const { Team, User, Video, VideoAssignment } = require('../models');

const getAssignments = async (req, res) => {
  try {
    const assignments = await VideoAssignment.findAll({
      include: [
        { model: Video, as: 'video' },
        { model: User, as: 'user', include: [{ model: Team, as: 'team' }] },
      ],
      order: [['id', 'DESC']],
    });
    res.json(assignments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createAssignment = async (req, res) => {
  try {
    const assignment = await VideoAssignment.create(req.body);
    const createdAssignment = await VideoAssignment.findByPk(assignment.id, {
      include: [
        { model: Video, as: 'video' },
        { model: User, as: 'user', include: [{ model: Team, as: 'team' }] },
      ],
    });
    res.status(201).json(createdAssignment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteAssignment = async (req, res) => {
  try {
    const deleted = await VideoAssignment.destroy({
      where: { id: req.params.id },
    });
    if (!deleted) {
      return res.status(404).json({ message: 'Assignment not found' });
    }

    res.json({ message: 'Assignment deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAssignments,
  createAssignment,
  deleteAssignment,
};
