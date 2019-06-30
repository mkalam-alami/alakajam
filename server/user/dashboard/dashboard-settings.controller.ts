import { Request } from "express";
import constants from "server/core/constants";
import fileStorage from "server/core/file-storage";
import forms from "server/core/forms";
import { anyRule, validateObject } from "server/core/forms-validation";
import { User } from "server/entity/user.entity";
import { CustomResponse } from "server/types";
import { logout } from "server/user/authentication/logout.controller";
import userService from "server/user/user.service";
import { DashboardLocals } from "./dashboard.middleware";

export async function dashboardSettingsGet(req: Request, res: CustomResponse<DashboardLocals>) {
  await renderForm(res, res.locals.dashboardUser);
}

/**
 * Manage general user info
 */
export async function dashboardSettingsPost(req: Request, res: CustomResponse<DashboardLocals>) {
  if (req.body.delete) {
    await _handleDeletion(req, res);
  } else {
    const dashboardUser = await _handleSave(req, res);
    await renderForm(res, dashboardUser);
  }
}

async function renderForm(res: CustomResponse<DashboardLocals>, dashboardUser: User) {
  res.render("user/dashboard/dashboard-settings", {
    dashboardUser
  });
}

async function _handleSave(req: Request, res: CustomResponse<DashboardLocals>): Promise<User> {
  const dashboardUser = res.locals.dashboardUser;
  const oldTitle = dashboardUser.title;

  // Update account info + bio
  dashboardUser.title = forms.sanitizeString(req.body.title || dashboardUser.name);
  dashboardUser.email = req.body.email;
  dashboardUser.details.body = forms.sanitizeMarkdown(req.body.body, { maxLength: constants.MAX_BODY_USER_DETAILS });
  dashboardUser.details.social_links = {
    website: req.body.website,
    twitter: forms.sanitizeString(req.body.twitter.replace("@", "")),
  };

  // Validate
  res.locals.errorMessage = await validateObject(req.body, {
    email: anyRule([forms.isNotSet, forms.isEmail], "Invalid email"),
    website: anyRule([forms.isNotSet, forms.isURL], "Account website has an invalid URL"),
    special_permissions: anyRule([forms.isNotSet, () => res.locals.dashboardAdminMode],
      "Not allowed to change special permissions on this user"),
    disallow_anonymous: anyRule([forms.isNotSet, () => res.locals.dashboardAdminMode],
      "Not allowed to change anonymous comments settings on this user"),
    file: anyRule([forms.isNotSet, (f) => fileStorage.isValidPicture(f.path)],
      "Invalid picture format (allowed: PNG GIF JPG)")
  });

  if (!res.locals.errorMessage) {
    // Admin mode
    if (res.locals.dashboardAdminMode) {
      dashboardUser.disallow_anonymous = req.body.disallow_anonymous === "on";
      if (req.body.special_permissions) {
        const isMod = ["mod", "admin"].includes(req.body.special_permissions);
        const isAdmin = req.body.special_permissions === "admin";
        dashboardUser.is_mod = isMod ? "true" : "";
        dashboardUser.is_admin = isAdmin ? "true" : "";
      }
    }

    // Save avatar
    if (req.file || req.body["avatar-delete"]) {
      const avatarPath = "/user/" + dashboardUser.id;
      await fileStorage.savePictureToModel(dashboardUser, "avatar", req.file,
        req.body["avatar-delete"], avatarPath, { maxDiagonal: 500 });
    }

    // Hooks
    if (dashboardUser.title !== oldTitle) {
      await userService.refreshUserReferences(dashboardUser);
    }

    await userService.save(dashboardUser);
  }

  return dashboardUser;
}

async function _handleDeletion(req: Request, res: CustomResponse<DashboardLocals>) {
  const deletingOwnAccount = res.locals.user.get("id") === res.locals.dashboardUser.id;
  const result = await userService.deleteUser(res.locals.dashboardUser);
  if (!result.error) {
    if (deletingOwnAccount) {
      logout(req, res);
    } else {
      res.redirect("/people");
    }
    return;
  } else {
    res.locals.errorMessage = result.error;
  }
}
