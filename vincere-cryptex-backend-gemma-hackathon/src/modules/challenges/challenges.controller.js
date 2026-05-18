import { challengesService } from './challenges.service.js';

export const challengesController = {
  listPublishedChallenges: async (req, res) => {
    const result = await challengesService.listPublishedChallenges({
      user: req.user,
      page: req.query?.page,
      pageSize: req.query?.pageSize,
      search: req.query?.search,
      category: req.query?.category,
      difficulty: req.query?.difficulty
    });

    res.status(200).json(result);
  },

  getChallengeDetails: async (req, res) => {
    const result = await challengesService.getChallengeDetails({
      user: req.user,
      challengeId: req.params.challengeId
    });

    res.status(200).json(result);
  },

  useHint: async (req, res) => {
    const result = await challengesService.useHint({
      user: req.user,
      challengeId: req.params.challengeId,
      hintPosition: req.params.hintPosition
    });

    res.status(200).json(result);
  },

  submitFlag: async (req, res) => {
    const result = await challengesService.submitFlag({
      user: req.user,
      challengeId: req.params.challengeId,
      flag: req.body?.flag
    });

    res.status(200).json(result);
  }
};
