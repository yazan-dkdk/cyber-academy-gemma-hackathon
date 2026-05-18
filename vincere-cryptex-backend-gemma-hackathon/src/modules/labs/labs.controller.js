import { labsService } from './labs.service.js';

export const labsController = {
  listPublishedLabs: async (req, res) => {
    const result = await labsService.listPublishedLabs({
      user: req.user,
      page: req.query?.page,
      pageSize: req.query?.pageSize,
      search: req.query?.search,
      category: req.query?.category,
      difficulty: req.query?.difficulty
    });

    res.status(200).json(result);
  },

  getLabDetails: async (req, res) => {
    const result = await labsService.getLabDetails({
      user: req.user,
      labId: req.params.labId
    });

    res.status(200).json(result);
  },

  getCurrentLabInstance: async (req, res) => {
    const result = await labsService.getCurrentLabInstance({
      user: req.user,
      labId: req.params.labId
    });

    res.status(200).json(result);
  },

  validateLabAccess: async (req, res) => {
    const result = await labsService.validateLabAccess({
      user: req.user,
      proxyToken: req.params.proxyToken
    });

    res.status(200).json(result);
  },

  startLab: async (req, res) => {
    const result = await labsService.startLab({
      user: req.user,
      labId: req.params.labId
    });

    res.status(result.reusedExistingInstance ? 200 : 201).json(result);
  },

  resetLab: async (req, res) => {
    const result = await labsService.resetLab({
      user: req.user,
      labId: req.params.labId
    });

    res.status(200).json(result);
  },

  terminateLab: async (req, res) => {
    const result = await labsService.terminateLab({
      user: req.user,
      labId: req.params.labId
    });

    res.status(200).json(result);
  }
};
