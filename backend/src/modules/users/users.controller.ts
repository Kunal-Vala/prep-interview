import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/common/guards/ws-jwt.guard';

@Controller('users')
export class UsersController {
    constructor(
        private readonly userService: UsersService
    ) { }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    getMe(@Req() req : any){
        return this.userService.findMe(req.user.sub)
    }
}
