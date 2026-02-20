import { Router } from "express";
import prisma from "@repo/db";
import jwt, { type JwtPayload } from "jsonwebtoken";
import {
  AUTH_JWT_SECRET,
  BACKEND_URL,
  EMAIL_JWT_SECRET,
  FROM_EMAIL_ADDRESS,
  FRONTEND_URL,
} from "../config";
import transporter from "../mail/transporter";
import authMiddleware from "../middleware/authMiddleware";
import { DecimalsMap } from "@repo/common";

const userRouter = Router();

const INITIAL_USD_BALANCE = 5000;

userRouter.post("/signup", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        message: "email is missing",
      });
      return;
    }

    const existedUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existedUser) {
      res.status(400).json({
        message: "User with given email already exists",
      });
      return;
    }

    const user = await prisma.user.create({
      data: {
        email,
        usdBalance: INITIAL_USD_BALANCE * 10 ** DecimalsMap["USDT"]!,
      },
    });

    const token = jwt.sign(
      {
        sub: user.email,
      },
      EMAIL_JWT_SECRET,
    );

    if (process.env.NODE_ENV === "production") {
      await transporter.sendMail({
        from: `"TradePro Support" <${FROM_EMAIL_ADDRESS}>`,
        to: email,
        subject: "Your Secure Sign-In Link",
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8" />
              <title>Register</title>
            </head>
            <body style="font-family: Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="padding: 30px; text-align: center;">
                    <h2 style="color: #111827; margin-bottom: 20px;">Welcome to TradePro</h2>
                    <p style="color: #374151; font-size: 16px; margin-bottom: 30px;">
                      Click the button below to securely access your dashboard.
                    </p>
                    <a href="${BACKEND_URL}/api/v1/user/signin/post?token=${token}" 
                       style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 6px;">
                      Go to Dashboard
                    </a>
                    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                      If you didn’t request this email, you can safely ignore it.
                    </p>
                  </td>
                </tr>
              </table>
            </body>
          </html>
        `,
      });
    } else {
      console.log(
        `click here to login : ${BACKEND_URL}/api/v1/user/signin/post?token=${token}`,
      );
    }

    res.status(200).json({
      message: "Email sent",
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

userRouter.post("/signin", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        message: "missing email",
      });
      return;
    }

    const existedUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (!existedUser) {
      res.status(400).json({
        message: "User with given email not found! Please sign in first",
      });
      return;
    }

    const token = jwt.sign(
      {
        sub: existedUser.email,
      },
      EMAIL_JWT_SECRET,
    );

    if (process.env.NODE_ENV === "production") {
      await transporter.sendMail({
        from: `"TradePro Support" <${FROM_EMAIL_ADDRESS}>`,
        to: email,
        subject: "Your Secure Sign-In Link",
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8" />
              <title>Sign In</title>
            </head>
            <body style="font-family: Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="padding: 30px; text-align: center;">
                    <h2 style="color: #111827; margin-bottom: 20px;">Welcome back to TradePro</h2>
                    <p style="color: #374151; font-size: 16px; margin-bottom: 30px;">
                      Click the button below to securely access your dashboard.
                    </p>
                    <a href="${BACKEND_URL}/api/v1/user/signin/post?token=${token}" 
                       style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: bold; border-radius: 6px;">
                      Go to Dashboard
                    </a>
                    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
                      If you didn’t request this email, you can safely ignore it.
                    </p>
                  </td>
                </tr>
              </table>
            </body>
          </html>
        `,
      });
    } else {
      console.log(
        `click here to login : ${BACKEND_URL}/api/v1/user/signin/post?token=${token}`,
      );
    }

    res.status(200).json({
      message: "Email sent",
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

userRouter.get("/signin/post", async (req, res) => {
  try {
    const token = req.query.token as string;

    const user = jwt.verify(token, EMAIL_JWT_SECRET) as JwtPayload;

    const userEmail = user.sub;

    const isUserExists = await prisma.user.findFirst({
      where: {
        email: userEmail,
      },
    });

    if (!isUserExists) {
      res.status(400).json({
        message: "User not found!",
      });
      return;
    }

    const authToken = jwt.sign(
      {
        sub: isUserExists.id,
      },
      AUTH_JWT_SECRET,
    );

    console.log(authToken);

    res.cookie(`authToken`, authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 3600 * 1000,
    });

    res.redirect(`${FRONTEND_URL}/dashboard`);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

userRouter.post("/signout", async (req, res) => {
  try {
    res.clearCookie("authToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    res.redirect(FRONTEND_URL);
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

userRouter.get("/balance/usd", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId!;

    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user) {
      res.status(400).json({
        message: "User not found!",
      });
      return;
    }

    const usdtDecmials = DecimalsMap["USDT"]!;

    const userBalance = user.usdBalance / 10 ** usdtDecmials;

    res.status(200).json({
      usdBalance: userBalance,
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

export default userRouter;
