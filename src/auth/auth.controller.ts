import {
    Controller,
    Get,
    //   Post,
    Patch,
    Delete,
    Body,
    Res,
    Req,
    UploadedFile,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import * as querystring from 'querystring';
import * as axios from 'axios';

@Controller('auth')
export class AuthController {
    constructor(
        private readonly authService: AuthService,
        private jwtService: JwtService,
    ) { }

    private readonly GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    private readonly GOOGLE_CLIENT_SECRET = process.env.GOOGLE_SECRET;
    private readonly GOOGLE_REDIRECT_URL = process.env.GOOGLE_REDIRECT;

    @Get('google')
    async googleAuth(@Req() req, @Res() res) {
        const params = {
            client_id: this.GOOGLE_CLIENT_ID,
            redirect_uri: this.GOOGLE_REDIRECT_URL,
            response_type: 'code',
            scope: 'openid profile email', // 요청할 권한 범위 설정
        };
        const url = `https://accounts.google.com/o/oauth2/auth?${querystring.stringify(
            params,
        )}`;
        return res.redirect(url);
    }

    @Get('google/redirect')
    async googleAuthRedirect(@Req() req, @Res({ passthrough: true }) res) {
        console.log('*');
        const code = req.query.code;
        console.log(code);

        // 인증 코드를 사용해 엑세스 토큰 요청
        const { data } = await axios.default.post(
            'https://accounts.google.com/o/oauth2/token',
            {
                code,
                client_id: this.GOOGLE_CLIENT_ID,
                client_secret: this.GOOGLE_CLIENT_SECRET,
                redirect_uri: this.GOOGLE_REDIRECT_URL,
                grant_type: 'authorization_code',
            },
        );

        const accessToken = data.access_token;

        // 엑세스 토큰을 사용해 사용자 정보 요청
        const response = await axios.default.get(
            'https://www.googleapis.com/oauth2/v1/userinfo',
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        );

        console.log(response.data);
        const thisUser = await this.authService.checkAndRegisterUser(response.data);

        const payload = {
            userId: thisUser.userId,
            nickname: thisUser.nickname,
            profileImgUrl: thisUser.profileImgUrl,
            googleId: thisUser.googleId,
        };

        const token = await this.jwtService.signAsync(payload);
        console.log(token);

        res
            .cookie('token', token, {
                domain: '.todayplaylist.site',
                secure: true,
                httpOnly: true,
                sameSite: 'none',
            })
            .status(200)
            .send(thisUser);
    }

    @Patch('nickname')
    updateNickname(@Body('nickname') nickname: string) {
        return this.authService.updateNickname(nickname);
    }

    @Patch('profileImage')
    @UseInterceptors(FileInterceptor('file'))
    async updateProfileImage(@UploadedFile() file: Express.MulterS3.File) {
        return this.authService.updateProfileImage(file);
    }

    @Get('')
    async getUserInfo(@Res() res) {
        const userId = res.locals.userId;
        console.log(res.locals);

        if (userId) {
            const thisUser = await this.authService.getUserInfo(userId);

            res.send(thisUser);
        } else {
            res.status(401).send({ login: false });
        }
    }

    @Delete('logout')
    async logoutUser(@Res() res) {
        res
            .clearCookie('token', {
                domain: '.todayplaylist.site',
                secure: true,
                httpOnly: true,
                sameSite: 'none',
            })
            .status(200)
            .json({
                login: false,
            });
    }
}
