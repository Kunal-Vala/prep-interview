import { Injectable, UnauthorizedException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nest/jwt";
import { PrismaService } from "src/prisma/prisma.service";
import { ConfigService } from "@nest/config"
import * as bcrypt from 'bcryptjs'
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "../users/dto/login.dto";

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwt: JwtService,
        private readonly config: ConfigService,
    ) { }

    async register(dto: RegisterDto) {
        const exists = await this.prisma.user.findUnique({ where: { email: dto.email } })
        if (exists) throw new ConflictException('Email Already Registered');

        const passwordHash = await bcrypt.hash(dto.password, 12)
        const user = await this.prisma.user.create({
            data: { email: dto.email, passwordHash, displayName: dto.displayName },
            select: { id: true, email: true, displayName: true, role: true, createdAt: true }
        })

        const token = await this.issueTokens(user.id, user.email)
        return { user, ...token }
    }

    
}