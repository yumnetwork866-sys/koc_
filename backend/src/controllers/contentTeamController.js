const { ContentTeam, UserContentAttribution } = require('../models');

const serializeTeam = (team) => {
  const value = team.get({ plain: true });
  value.user_count = Array.isArray(value.user_attributions) ? value.user_attributions.length : 0;
  delete value.user_attributions;
  return value;
};

const getTeams = async (_req, res) => {
  try {
    const teams = await ContentTeam.findAll({
      include: [{
        model: UserContentAttribution,
        as: 'user_attributions',
        attributes: ['user_id'],
        required: false,
      }],
      order: [['name', 'ASC'], ['id', 'ASC']],
    });
    res.json(teams.map(serializeTeam));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const createTeam = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Team name is required.' });
    const duplicate = await ContentTeam.findOne({ where: { name } });
    if (duplicate) return res.status(409).json({ message: 'Team name already exists.' });
    const team = await ContentTeam.create({ name: name.slice(0, 120) });
    res.status(201).json({ ...team.get({ plain: true }), user_count: 0 });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const updateTeam = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Team name is required.' });
    const team = await ContentTeam.findByPk(req.params.id);
    if (!team) return res.status(404).json({ message: 'Team not found.' });
    await team.update({ name: name.slice(0, 120), updated_at: new Date() });
    res.json({ ...team.get({ plain: true }), user_count: await UserContentAttribution.count({ where: { team_id: team.id } }) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const deleteTeam = async (req, res) => {
  try {
    const team = await ContentTeam.findByPk(req.params.id);
    if (!team) return res.status(404).json({ message: 'Team not found.' });
    await team.destroy();
    res.json({ message: 'Team deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getTeams, createTeam, updateTeam, deleteTeam };
